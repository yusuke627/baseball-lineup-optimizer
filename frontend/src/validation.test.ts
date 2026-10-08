import { describe, expect, test } from 'vitest'

// バックエンドのテスト (backend/tests/test_validation.py) と同じ入力例を使い、検証結果が一致することを確認する
import casesFile from '../../schemas/batter_stats_validation_cases.json'
import { STAT_KEYS, type StatKey } from './api/types'
import {
  emptyRawStats,
  MAX_STAT_VALUE,
  parseAndValidate,
  validateStats,
  type RawStats,
} from './validation'

interface SharedCase {
  name: string
  override: Partial<Record<StatKey, number | null>>
  valid: boolean
  warning: boolean
  rule: string | null
}

const base = casesFile.base as Record<StatKey, number>
const cases = casesFile.cases as SharedCase[]

function statsFor(testCase: SharedCase): Partial<Record<StatKey, number>> {
  const stats: Partial<Record<StatKey, number>> = { ...base }
  for (const [key, value] of Object.entries(testCase.override) as [StatKey, number | null][]) {
    if (value === null) {
      delete stats[key] // null は「項目を省略する」ことを表す
    } else {
      stats[key] = value
    }
  }
  return stats
}

function toRaw(stats: Partial<Record<StatKey, number>>): RawStats {
  const raw = emptyRawStats()
  for (const key of STAT_KEYS) {
    const value = stats[key]
    if (value !== undefined) {
      raw[key] = String(value)
    }
  }
  return raw
}

describe('バックエンドと共通の入力例', () => {
  test('入力例は15件ある', () => {
    expect(cases).toHaveLength(15)
  })

  test('上限の値がバックエンドと同じ', () => {
    expect(MAX_STAT_VALUE).toBe(casesFile.max_stat_value)
  })

  test.each(cases)('$name', (testCase) => {
    const result = validateStats(statsFor(testCase))

    expect(result.errors.length === 0).toBe(testCase.valid)
    expect(result.warnings.length > 0).toBe(testCase.warning)
    if (!testCase.valid) {
      expect(result.errors[0].rule).toBe(testCase.rule)
    }
    if (testCase.warning) {
      expect(result.warnings[0].rule).toBe(testCase.rule)
    }
  })

  test.each(cases)('入力欄の文字列からでも同じ結果になる: $name', (testCase) => {
    const parsed = parseAndValidate(toRaw(statsFor(testCase)))

    expect(parsed.result.errors.length === 0).toBe(testCase.valid)
    expect(parsed.result.warnings.length > 0).toBe(testCase.warning)
    expect(parsed.stats !== null).toBe(testCase.valid)
  })
})

describe('入力欄の文字列の扱い', () => {
  test('空欄の犠打は0として送る', () => {
    const raw = toRaw({ ...base, PA: 595 })
    raw.SH = ''
    const parsed = parseAndValidate(raw)
    expect(parsed.result.errors).toEqual([])
    expect(parsed.stats?.SH).toBe(0)
  })

  test('犠打以外の空欄は未入力エラーになる', () => {
    const raw = toRaw(base)
    raw.HR = ''
    const parsed = parseAndValidate(raw)
    expect(parsed.result.errors.map((issue) => [issue.rule, issue.fields])).toEqual([
      ['REQUIRED', ['HR']],
    ])
    expect(parsed.stats).toBeNull()
  })

  test.each(['1.5', 'abc', '1e3', '１２'])('整数でない入力 "%s" は形式エラーになる', (text) => {
    const raw = toRaw(base)
    raw.BB = text
    const parsed = parseAndValidate(raw)
    expect(parsed.result.errors.map((issue) => [issue.rule, issue.fields])).toEqual([
      ['INTEGER', ['BB']],
    ])
  })

  test('前後の空白は無視する', () => {
    const raw = toRaw(base)
    raw.PA = ' 600 '
    expect(parseAndValidate(raw).stats?.PA).toBe(600)
  })

  test('項目ごとのエラーがあるときは、項目間の矛盾や警告は報告しない', () => {
    const raw = toRaw({ ...base, H: 541, PA: 610 })
    raw.BB = '-1'
    const parsed = parseAndValidate(raw)
    expect(parsed.result.errors.map((issue) => issue.rule)).toEqual(['RANGE'])
    expect(parsed.result.warnings).toEqual([])
  })

  test('エラーが無ければ、APIに送る14項目がそろう', () => {
    const parsed = parseAndValidate(toRaw(base))
    expect(parsed.stats).toEqual(base)
  })
})

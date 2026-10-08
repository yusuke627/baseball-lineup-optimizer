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

  test('項目ごとのエラーがある項目を使う規則と警告は、判定しない', () => {
    // BB が不正なので、BB を使う「打席数と内訳の不一致」の警告は判定しない
    const raw = toRaw({ ...base, PA: 610 })
    raw.BB = '-1'
    const parsed = parseAndValidate(raw)
    expect(parsed.result.errors.map((issue) => issue.rule)).toEqual(['RANGE'])
    expect(parsed.result.warnings).toEqual([])
    expect(parsed.stats).toBeNull()
  })

  test('エラーが無ければ、APIに送る14項目がそろう', () => {
    const parsed = parseAndValidate(toRaw(base))
    expect(parsed.stats).toEqual(base)
  })
})

// 入力の途中 (一部の項目だけ入力済み) の判定。バックエンドには無い、フロント専用の動作。
// 規則ごとに、その規則に必要な項目がそろっていれば判定する。
describe('一部の項目だけ入力されているときの判定', () => {
  /** 未入力 (REQUIRED) 以外のエラーの規則 */
  function crossRules(stats: Partial<Record<StatKey, number>>): string[] {
    return validateStats(stats)
      .errors.filter((issue) => issue.rule !== 'REQUIRED')
      .map((issue) => issue.rule)
  }

  test('打数と安打だけで「安打が打数を超えている」を報告する', () => {
    const result = validateStats({ AB: 100, H: 101 })
    const issue = result.errors.find((error) => error.rule === 'H_LE_AB')
    expect(issue?.fields).toEqual(['H', 'AB'])
    // 残りの必須項目は、未入力として報告する
    expect(result.errors.filter((error) => error.rule === 'REQUIRED')).toHaveLength(11)
  })

  test('打席数と打数だけで「打数が打席数を超えている」を報告する', () => {
    expect(crossRules({ PA: 100, AB: 101 })).toEqual(['AB_LE_PA'])
    expect(crossRules({ PA: 100, AB: 100 })).toEqual([])
  })

  test('長打の合計は、二塁打・三塁打・本塁打・安打の4つがそろってから判定する', () => {
    expect(crossRules({ '2B': 10, '3B': 10, H: 5 })).toEqual([]) // 本塁打が未入力
    expect(crossRules({ '2B': 10, '3B': 10, HR: 0, H: 5 })).toEqual(['XBH_LE_H'])
  })

  test('三振と併殺打の合計は、三振・併殺打・打数・安打の4つがそろってから判定する', () => {
    expect(crossRules({ SO: 100, AB: 100, H: 50 })).toEqual([]) // 併殺打が未入力
    expect(crossRules({ SO: 100, GIDP: 0, AB: 100, H: 50 })).toEqual(['SO_GIDP_LE_OUTS'])
  })

  test('安打が打数を超えているときは、凡退の数に関する規則は重ねて報告しない', () => {
    expect(crossRules({ SO: 0, GIDP: 0, AB: 100, H: 101 })).toEqual(['H_LE_AB'])
  })

  test('そろった規則は、複数あればすべて報告する', () => {
    expect(crossRules({ PA: 100, AB: 101, H: 102 })).toEqual(['AB_LE_PA', 'H_LE_AB'])
  })

  test('規則に必要な項目に項目ごとのエラーがあれば、その規則は判定しない', () => {
    expect(crossRules({ AB: -1, H: 5 })).toEqual(['RANGE'])
    const parsed = parseAndValidate({ ...emptyRawStats(), AB: 'abc', H: '5' })
    expect(parsed.result.errors.filter((issue) => issue.rule !== 'REQUIRED').map((issue) => issue.rule)).toEqual([
      'INTEGER',
    ])
  })

  test('項目ごとのエラーがあっても、関係のない項目の矛盾は報告する', () => {
    expect(crossRules({ ...base, BB: -1, H: 541, SO: 0, GIDP: 0 })).toEqual(['RANGE', 'H_LE_AB'])
  })

  test('打席数と内訳の不一致の警告は、打席数・打数・四球・死球・犠飛がそろってから判定する', () => {
    expect(validateStats({ PA: 610, AB: 540, BB: 40, HBP: 10 }).warnings).toEqual([]) // 犠飛が未入力
    const result = validateStats({ PA: 610, AB: 540, BB: 40, HBP: 10, SF: 5, SH: 5 })
    expect(result.warnings.map((issue) => issue.rule)).toEqual(['PA_SUM_MISMATCH'])
    // 未入力の犠打は0として扱う (540+40+10+5=595)
    expect(validateStats({ PA: 595, AB: 540, BB: 40, HBP: 10, SF: 5 }).warnings).toEqual([])
  })

  test('警告に関係する項目に矛盾のエラーがあるときは、警告を出さない', () => {
    const result = validateStats({ PA: 100, AB: 101, BB: 0, HBP: 0, SF: 0, SH: 0 })
    expect(result.errors.some((issue) => issue.rule === 'AB_LE_PA')).toBe(true)
    expect(result.warnings).toEqual([])
  })

  test('入力の途中では、APIに送る成績は作らない', () => {
    const parsed = parseAndValidate({ ...emptyRawStats(), AB: '100', H: '50' })
    expect(parsed.stats).toBeNull()
  })
})

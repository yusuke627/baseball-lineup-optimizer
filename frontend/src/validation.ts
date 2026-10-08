// 打者成績の入力検証。ルールはバックエンド (backend/app/schemas/batter.py) と同じにする。
// 両者の一致は、共通の入力例 schemas/batter_stats_validation_cases.json を使ったテストで確認している。

import { STAT_KEYS, type BatterStats, type StatKey } from './api/types'

/** 各成績の上限。統計的な根拠のある値ではなく、誤入力や悪用を防ぐための安全上の上限 (バックエンドと同じ値) */
export const MAX_STAT_VALUE = 20000

export const STAT_LABELS: Record<StatKey, string> = {
  PA: '打席数',
  AB: '打数',
  H: '安打',
  '2B': '二塁打',
  '3B': '三塁打',
  HR: '本塁打',
  BB: '四球',
  HBP: '死球',
  SO: '三振',
  SF: '犠飛',
  SH: '犠打',
  GIDP: '併殺打',
  SB: '盗塁',
  CS: '盗塁死',
}

/** 省略できる項目 (空欄なら 0 として扱う)。バックエンドでも SH だけが省略可能 */
const OPTIONAL_KEYS: ReadonlySet<StatKey> = new Set<StatKey>(['SH'])

export type RuleId =
  | 'REQUIRED'
  | 'INTEGER'
  | 'RANGE'
  | 'PA_MIN'
  | 'AB_LE_PA'
  | 'H_LE_AB'
  | 'XBH_LE_H'
  | 'SO_GIDP_LE_OUTS'
  | 'PA_SUM_MISMATCH'

export interface ValidationIssue {
  rule: RuleId
  /** この問題に関係する入力欄 */
  fields: StatKey[]
  message: string
}

export interface ValidationResult {
  /** 入力エラー。1件でもあれば API に送らない (API も 422 を返す) */
  errors: ValidationIssue[]
  /** 計算はできるが利用者に知らせる点 (API も warnings で返す) */
  warnings: ValidationIssue[]
}

export type RawStats = Record<StatKey, string>

export function emptyRawStats(): RawStats {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, ''])) as RawStats
}

function label(key: StatKey): string {
  return `${STAT_LABELS[key]}(${key})`
}

function fieldIssue(key: StatKey, value: number): ValidationIssue | null {
  if (!Number.isInteger(value)) {
    return { rule: 'INTEGER', fields: [key], message: `${label(key)}は整数で入力してください。` }
  }
  if (key === 'PA' && value === 0) {
    return { rule: 'PA_MIN', fields: [key], message: `${label(key)}は1以上で入力してください。` }
  }
  if (value < 0 || value > MAX_STAT_VALUE) {
    return {
      rule: 'RANGE',
      fields: [key],
      message: `${label(key)}は0以上${MAX_STAT_VALUE}以下で入力してください。`,
    }
  }
  return null
}

/**
 * 数値になった成績を検証する。
 * バックエンドと同じく、まず項目ごとの範囲を確認し、すべて正しい場合にだけ項目間の矛盾を確認する。
 * SH が無い場合は 0 として扱う。
 */
export function validateStats(input: Partial<Record<StatKey, number>>): ValidationResult {
  const errors: ValidationIssue[] = []

  for (const key of STAT_KEYS) {
    const value = input[key]
    if (value === undefined) {
      if (!OPTIONAL_KEYS.has(key)) {
        errors.push({ rule: 'REQUIRED', fields: [key], message: `${label(key)}を入力してください。` })
      }
      continue
    }
    const issue = fieldIssue(key, value)
    if (issue) {
      errors.push(issue)
    }
  }
  if (errors.length > 0) {
    return { errors, warnings: [] }
  }

  const s = { ...input, SH: input.SH ?? 0 } as BatterStats

  if (s.AB > s.PA) {
    errors.push({
      rule: 'AB_LE_PA',
      fields: ['AB', 'PA'],
      message: `${label('AB')}が${label('PA')}を超えています。`,
    })
  }
  if (s.H > s.AB) {
    errors.push({
      rule: 'H_LE_AB',
      fields: ['H', 'AB'],
      message: `${label('H')}が${label('AB')}を超えています。`,
    })
  }
  if (s['2B'] + s['3B'] + s.HR > s.H) {
    errors.push({
      rule: 'XBH_LE_H',
      fields: ['2B', '3B', 'HR', 'H'],
      message: `二塁打・三塁打・本塁打の合計が${label('H')}を超えています。`,
    })
  }
  if (s.SO + s.GIDP > s.AB - s.H) {
    errors.push({
      rule: 'SO_GIDP_LE_OUTS',
      fields: ['SO', 'GIDP', 'AB', 'H'],
      message: `${label('SO')}と${label('GIDP')}の合計が、凡退の数（打数から安打を引いた数）を超えています。`,
    })
  }
  if (errors.length > 0) {
    return { errors, warnings: [] }
  }

  const warnings: ValidationIssue[] = []
  if (s.AB + s.BB + s.HBP + s.SF + s.SH !== s.PA) {
    warnings.push({
      rule: 'PA_SUM_MISMATCH',
      fields: ['PA', 'AB', 'BB', 'HBP', 'SF', 'SH'],
      message: `${label('PA')}が、打数・四球・死球・犠飛・犠打の合計と一致しません。このままでも計算できますが、入力に誤りがないか確認してください。`,
    })
  }
  return { errors, warnings }
}

export interface ParsedStats {
  /** 数値として読めた項目 (空欄の SH は含めない) */
  values: Partial<Record<StatKey, number>>
  result: ValidationResult
  /** エラーが無いときだけ入る。API にそのまま送れる形 */
  stats: BatterStats | null
}

const INTEGER_PATTERN = /^-?\d+$/

/** 入力欄の文字列を数値に直して検証する */
export function parseAndValidate(raw: RawStats): ParsedStats {
  const values: Partial<Record<StatKey, number>> = {}
  const formatErrors: ValidationIssue[] = []

  for (const key of STAT_KEYS) {
    const text = raw[key].trim()
    if (text === '') {
      continue // 未入力。必須かどうかは validateStats が判定する
    }
    if (!INTEGER_PATTERN.test(text)) {
      formatErrors.push({
        rule: 'INTEGER',
        fields: [key],
        message: `${label(key)}は整数で入力してください。`,
      })
      continue
    }
    values[key] = Number(text)
  }

  const validated = validateStats(values)
  // 形式が正しくない項目は values に入っていないため REQUIRED として報告される。形式エラーに置き換える
  const badFormatKeys = new Set(formatErrors.flatMap((issue) => issue.fields))
  const errors = [
    ...formatErrors,
    ...validated.errors.filter(
      (issue) => !(issue.rule === 'REQUIRED' && badFormatKeys.has(issue.fields[0])),
    ),
  ]
  const result: ValidationResult = { errors, warnings: errors.length > 0 ? [] : validated.warnings }
  const stats = errors.length === 0 ? ({ ...values, SH: values.SH ?? 0 } as BatterStats) : null
  return { values, result, stats }
}

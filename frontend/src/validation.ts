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
 * 数値になった成績を検証する。SH が無い場合は 0 として扱う。
 *
 * 項目間の矛盾は、規則ごとに、その規則に必要な項目がそろって (入力済みで、項目ごとのエラーが無く) いれば
 * 判定する。ほかの項目が未入力でも、たとえば AB と H だけで「安打が打数を超えている」を報告する。
 * 全項目が入力された成績では、有効・無効と警告の有無がバックエンドと一致する
 * (schemas/batter_stats_validation_cases.json の例でテストしている)。
 */
export function validateStats(input: Partial<Record<StatKey, number>>): ValidationResult {
  const errors: ValidationIssue[] = []
  /** 判定に使えない項目 (未入力、または項目ごとのエラーがある) */
  const unusable = new Set<StatKey>()

  for (const key of STAT_KEYS) {
    const value = input[key]
    if (value === undefined) {
      if (!OPTIONAL_KEYS.has(key)) {
        unusable.add(key)
        errors.push({ rule: 'REQUIRED', fields: [key], message: `${label(key)}を入力してください。` })
      }
      continue
    }
    const issue = fieldIssue(key, value)
    if (issue) {
      unusable.add(key)
      errors.push(issue)
    }
  }

  const s = { ...input, SH: input.SH ?? 0 } as BatterStats
  const ready = (fields: StatKey[]) => fields.every((key) => !unusable.has(key))
  const crossErrors: ValidationIssue[] = []
  const check = (rule: RuleId, fields: StatKey[], violated: () => boolean, message: string) => {
    if (ready(fields) && violated()) {
      crossErrors.push({ rule, fields, message })
    }
  }

  check(
    'AB_LE_PA',
    ['AB', 'PA'],
    () => s.AB > s.PA,
    `${label('AB')}が${label('PA')}を超えています。`,
  )
  check('H_LE_AB', ['H', 'AB'], () => s.H > s.AB, `${label('H')}が${label('AB')}を超えています。`)
  check(
    'XBH_LE_H',
    ['2B', '3B', 'HR', 'H'],
    () => s['2B'] + s['3B'] + s.HR > s.H,
    `二塁打・三塁打・本塁打の合計が${label('H')}を超えています。`,
  )
  check(
    'SO_GIDP_LE_OUTS',
    ['SO', 'GIDP', 'AB', 'H'],
    // 安打が打数を超えているときは、その矛盾だけを報告する (凡退の数が負になり、この規則も必ず違反になるため)
    () => s.H <= s.AB && s.SO + s.GIDP > s.AB - s.H,
    `${label('SO')}と${label('GIDP')}の合計が、凡退の数（打数から安打を引いた数）を超えています。`,
  )
  errors.push(...crossErrors)

  // 警告も、関係する項目がそろっていれば判定する。ただし関係する項目に矛盾のエラーがあるときは出さない
  const warnings: ValidationIssue[] = []
  const sumFields: StatKey[] = ['PA', 'AB', 'BB', 'HBP', 'SF', 'SH']
  const sumFieldsHaveError = crossErrors.some((issue) =>
    issue.fields.some((key) => sumFields.includes(key)),
  )
  if (ready(sumFields) && !sumFieldsHaveError && s.AB + s.BB + s.HBP + s.SF + s.SH !== s.PA) {
    warnings.push({
      rule: 'PA_SUM_MISMATCH',
      fields: sumFields,
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
  const result: ValidationResult = { errors, warnings: validated.warnings }
  const stats = errors.length === 0 ? ({ ...values, SH: values.SH ?? 0 } as BatterStats) : null
  return { values, result, stats }
}

// バックエンド (backend/app/schemas/batter.py, backend/app/main.py) のリクエスト・レスポンスの形。

export const STAT_KEYS = [
  'PA',
  'AB',
  'H',
  '2B',
  '3B',
  'HR',
  'BB',
  'HBP',
  'SO',
  'SF',
  'SH',
  'GIDP',
  'SB',
  'CS',
] as const

export type StatKey = (typeof STAT_KEYS)[number]

export type BatterStats = Record<StatKey, number>

export interface PresetSource {
  provider: string
  url: string
  retrieved_at: string
}

/** GET /presets がアプリ側で計算して付ける表示用指標 */
export interface PresetSummary {
  PA: number
  HR: number
  AVG: number
  OBP: number
  SLG: number
  SB: number
  CS: number
  SB_pct: number | null
}

/**
 * 公表されている指標の参考値 (プリセットの JSON に書かれた値を API がそのまま返す)。
 * モデルの計算には使わない。wOBA と wRC+ は、少なくとも一方がある。
 */
export interface ReferenceMetrics {
  wOBA?: number
  wRC_plus?: number
  /** 値の対象シーズン */
  season: number
  source: { provider: string; url: string }
  retrieved_at: string
  note?: string
}

export interface Preset {
  id: string
  name: string
  team?: string
  season: number
  league: string
  verified?: boolean
  source: PresetSource
  stats: BatterStats
  summary: PresetSummary
  /** 参考値。プリセットに無ければ null */
  reference_metrics: ReferenceMetrics | null
}

export interface LineupEvaluationRequest {
  /** キーは任意の打者ID (1〜64文字) */
  batters: Record<string, BatterStats>
  input_order: string[]
  n_games?: number
  /** 打者ID → 表示名 (1〜40文字)。指定すると warnings の文に打者IDではなく表示名が使われる */
  display_names?: Record<string, string>
}

export interface GamesTotal {
  n_games: number
  input_order_runs: number
  best_order_runs: number
}

export interface MonteCarloSummary {
  mean: number
  std: number
  min: number
  max: number
  n_trials: number
}

export interface LineupEvaluationResponse {
  input_order: string[]
  input_order_runs_per_game: number
  input_order_runs_n_games: number
  best_order: string[]
  best_order_runs_per_game: number
  best_order_runs_n_games: number
  inefficiency_percent: number
  n_games: number
  monte_carlo: MonteCarloSummary | null
  totals_by_games: GamesTotal[]
  warnings: string[]
}

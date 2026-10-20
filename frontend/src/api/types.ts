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
  /** 生成の方法や照合の状況などの補足 */
  note?: string
}

/** 所属球団 (移籍した選手は、そのシーズンの最後に出場した球団) */
export interface TeamInfo {
  /** 球団コード (例: NYY、SD) */
  code: string
  name: string
  league: 'AL' | 'NL'
  /** 地区 (E: 東、C: 中、W: 西) */
  division?: Division
  /** Lahman Baseball Database の teamID */
  lahman_id?: string
}

export type Division = 'E' | 'C' | 'W'

/** 在籍した球団 (出場した順)。複数の球団に在籍した選手だけにある */
export interface TeamPlayed {
  code: string
  name: string
}

/** GET /presets がアプリ側で計算して付ける表示用指標 */
export interface PresetSummary {
  PA: number
  HR: number
  AVG: number
  OBP: number
  SLG: number
  /** OPS = 出塁率 + 長打率 (API が計算した値) */
  OPS: number
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
  team_info?: TeamInfo
  teams_played?: TeamPlayed[]
}

/** GET /presets/seasons */
export interface PresetSeasons {
  league: string
  /** プリセットのあるシーズン (古い順) */
  seasons: number[]
}

export interface PresetTeam {
  code: string
  name: string
  league: 'AL' | 'NL'
  /** 地区。地区の情報が無い球団は null */
  division: Division | null
  /** この球団を最終所属とする選手の数 */
  count: number
}

/** GET /presets/teams */
export interface PresetTeams {
  season: number
  leagues: { league: 'AL' | 'NL'; teams: PresetTeam[] }[]
  /** 球団の情報が無いプリセットの数 */
  without_team: number
}

/** GET /presets に team か q を付けたときの応答 */
export interface PresetSearchResult {
  /** 条件に合う総数 (q があるときは、items が上限で切られていることがある) */
  total: number
  items: Preset[]
}

export interface LineupEvaluationRequest {
  /** キーは任意の打者ID (1〜64文字) */
  batters: Record<string, BatterStats>
  input_order: string[]
  n_games?: number
  /** 打者ID → 表示名 (1〜40文字)。指定すると warnings の文に打者IDではなく表示名が使われる */
  display_names?: Record<string, string>
}

/** POST /batters/metrics のリクエスト (1〜9人) */
export interface BatterMetricsRequest {
  batters: Record<string, BatterStats>
  display_names?: Record<string, string>
}

/** 打者1人分の表示用の指標 (API が計算した値。分母が0のものは null) */
/** 注意の種類 (PA_SUM_MISMATCH: 打席数と内訳の合計が合わない、LOW_PA: 打席数が少ない) */
export type WarningCode = 'PA_SUM_MISMATCH' | 'LOW_PA'

export interface WarningItem {
  code: WarningCode
  /** 画面にそのまま出す文 */
  message: string
}

export interface BatterMetrics {
  PA: number
  /** 安打 (入力値のまま) */
  H: number
  HR: number
  SB: number
  CS: number
  AVG: number | null
  OBP: number | null
  SLG: number | null
  OPS: number | null
  BB_pct: number
  SO_pct: number
  /** この打者についての注意 (打席数が少ない、打席数と内訳が合わない など)。API の文のまま */
  warnings: string[]
  /** 種類つきの注意 (message は warnings と同じ文) */
  warning_items: WarningItem[]
}

export interface BatterMetricsResponse {
  batters: Record<string, BatterMetrics>
}

export interface GamesTotal {
  n_games: number
  input_order_runs: number
  best_order_runs: number
  /** 推奨打順に対する入力打順の損失点 (サーバーが best_order_runs - input_order_runs を計算) */
  runs_lost: number
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
  /** 1試合あたりの損失点 (サーバーが best_order_runs_per_game - input_order_runs_per_game を計算) */
  runs_lost_per_game: number
  n_games: number
  monte_carlo: MonteCarloSummary | null
  totals_by_games: GamesTotal[]
  warnings: string[]
}

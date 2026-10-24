import type {
  BatterMetricsRequest,
  BatterMetricsResponse,
  LineupEvaluationRequest,
  LineupEvaluationResponse,
  Preset,
  PresetSearchResult,
  PresetSeasons,
  PresetTeams,
} from './types'

// API は相対パスで呼ぶ。開発時は Vite のプロキシが /api をバックエンドに転送する (vite.config.ts)。
const API_BASE = '/api'

/**
 * エラーの種類。画面ではこの種類ごとに表示を分ける。
 * - input: 入力内容の誤り (API の 422・400)
 * - api: サーバー側のエラー (500 など)
 * - network: サーバーに届かない・応答が壊れている
 * - aborted: 利用者によるキャンセル
 */
export type ApiErrorKind = 'input' | 'api' | 'network' | 'aborted'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

// バックエンドが 400 で返す英語のメッセージ (backend/app/main.py) を、画面用の日本語に置き換える
const BAD_REQUEST_MESSAGES: Record<string, string> = {
  'input_order must contain exactly the given batter ids':
    '打順に含まれる打者と、入力された打者が一致していません。',
  'exactly 9 batters are required': '打者は9人ちょうど必要です。',
  'input_order must not contain duplicate batter ids': '打順に同じ打者が重複しています。',
  'display_names must contain exactly the given batter ids':
    '表示名が指定された打者と、入力された打者が一致していません。',
  'display_names must not contain duplicate names':
    '打者の表示名が重複しています。別の名前にしてください。',
}

/** キャンセルの通知の補足 (もとは通知の文の括弧の中にあった文。原文のまま) */
export const ABORTED_DETAIL = '（サーバー側で始まった計算は、最後まで実行されることがあります）'

const MESSAGES = {
  badRequestDefault: '入力内容に誤りがあるため、計算できませんでした。',
  unprocessable:
    '入力された成績に誤りがあるため、計算できませんでした。各打者の成績を確認してください。',
  gateway:
    'サーバーに接続できませんでした。バックエンドが起動しているか、通信状況を確認してください。',
  network:
    'サーバーに接続できませんでした。バックエンドが起動しているか、通信状況を確認してください。',
  // 括弧の中の補足 (ABORTED_DETAIL) は、画面では「キャンセルについての説明」のボタンの中に出す
  aborted: '計算をキャンセルしました。結果は表示しません。',
  invalidResponse: 'サーバーからの応答を読み取れませんでした。',
  server: (status: number) =>
    `サーバーでエラーが発生しました（ステータス ${status}）。時間をおいて、もう一度お試しください。`,
}

async function readDetail(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      return (body as { detail: unknown }).detail
    }
  } catch {
    // 本文が JSON でない場合は詳細なしとして扱う
  }
  return null
}

async function toApiError(response: Response): Promise<ApiError> {
  const { status } = response
  if (status === 422) {
    return new ApiError('input', MESSAGES.unprocessable, status)
  }
  if (status === 400) {
    const detail = await readDetail(response)
    const message =
      typeof detail === 'string' && detail in BAD_REQUEST_MESSAGES
        ? BAD_REQUEST_MESSAGES[detail]
        : MESSAGES.badRequestDefault
    return new ApiError('input', message, status)
  }
  // 開発サーバーのプロキシは、バックエンドに届かないとき 502/503/504 を返す
  if (status === 502 || status === 503 || status === 504) {
    return new ApiError('network', MESSAGES.gateway, status)
  }
  return new ApiError('api', MESSAGES.server(status), status)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('aborted', MESSAGES.aborted)
    }
    throw new ApiError('network', MESSAGES.network)
  }
  if (!response.ok) {
    throw await toApiError(response)
  }
  try {
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('aborted', MESSAGES.aborted)
    }
    throw new ApiError('network', MESSAGES.invalidResponse, response.status)
  }
}

export function fetchPresets(signal?: AbortSignal): Promise<Preset[]> {
  return request<Preset[]>('/presets?league=mlb&season=2025', { signal })
}

export function fetchPresetSeasons(signal?: AbortSignal): Promise<PresetSeasons> {
  return request<PresetSeasons>('/presets/seasons?league=mlb', { signal })
}

export function fetchPresetTeams(season: number, signal?: AbortSignal): Promise<PresetTeams> {
  const params = new URLSearchParams({ league: 'mlb', season: String(season) })
  return request<PresetTeams>(`/presets/teams?${params}`, { signal })
}

/** 球団 (team) か選手名の一部 (q) で、プリセットを探す。q があるときは、最大50件と総数が返る */
export function searchPresets(
  { season, team, q }: { season: number; team?: string; q?: string },
  signal?: AbortSignal,
): Promise<PresetSearchResult> {
  const params = new URLSearchParams({ league: 'mlb', season: String(season) })
  if (team) {
    params.set('team', team)
  }
  if (q) {
    params.set('q', q)
  }
  return request<PresetSearchResult>(`/presets?${params}`, { signal })
}

/** 打者ごとの表示用の指標と注意を求める (得点期待値の計算はしない) */
export async function fetchBatterMetrics(
  body: BatterMetricsRequest,
  signal?: AbortSignal,
): Promise<BatterMetricsResponse> {
  const data = await request<BatterMetricsResponse>('/batters/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (typeof data !== 'object' || data === null || typeof data.batters !== 'object' || data.batters === null) {
    throw new ApiError('network', MESSAGES.invalidResponse)
  }
  return data
}

export function evaluateLineup(
  body: LineupEvaluationRequest,
  signal?: AbortSignal,
): Promise<LineupEvaluationResponse> {
  return request<LineupEvaluationResponse>('/lineup/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

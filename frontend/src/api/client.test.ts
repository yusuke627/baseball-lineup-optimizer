import { afterEach, describe, expect, test, vi } from 'vitest'

import { ApiError, evaluateLineup, fetchPresets } from './client'
import type { LineupEvaluationRequest } from './types'

const REQUEST: LineupEvaluationRequest = { batters: {}, input_order: [] }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch(implementation: () => Promise<Response>) {
  const mock = vi.fn(implementation)
  vi.stubGlobal('fetch', mock)
  return mock
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('エラーになるはずの呼び出しが成功した')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('呼び出し先', () => {
  test('プリセットは相対パス /api/presets を GET する', async () => {
    const mock = stubFetch(async () => jsonResponse([]))
    await expect(fetchPresets()).resolves.toEqual([])
    expect(mock).toHaveBeenCalledWith('/api/presets?league=mlb&season=2025', { signal: undefined })
  })

  test('評価は相対パス /api/lineup/evaluate に JSON を POST する', async () => {
    const mock = stubFetch(async () => jsonResponse({ warnings: [] }))
    await evaluateLineup(REQUEST)
    expect(mock).toHaveBeenCalledWith('/api/lineup/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(REQUEST),
      signal: undefined,
    })
  })
})

describe('エラーの分類と日本語メッセージ', () => {
  test('422 は入力エラーとして、日本語のメッセージに置き換える', async () => {
    stubFetch(async () =>
      jsonResponse({ detail: [{ msg: 'Value error, H must be less than or equal to AB' }] }, 422),
    )
    const error = await captureError(evaluateLineup(REQUEST))
    expect(error.kind).toBe('input')
    expect(error.status).toBe(422)
    expect(error.message).toBe(
      '入力された成績に誤りがあるため、計算できませんでした。各打者の成績を確認してください。',
    )
  })

  test.each([
    [
      'input_order must contain exactly the given batter ids',
      '打順に含まれる打者と、入力された打者が一致していません。',
    ],
    ['exactly 9 batters are required', '打者は9人ちょうど必要です。'],
    [
      'input_order must not contain duplicate batter ids',
      '打順に同じ打者が重複しています。',
    ],
    [
      'display_names must contain exactly the given batter ids',
      '表示名が指定された打者と、入力された打者が一致していません。',
    ],
    [
      'display_names must not contain duplicate names',
      '打者の表示名が重複しています。別の名前にしてください。',
    ],
    ['some new message', '入力内容に誤りがあるため、計算できませんでした。'],
  ])('400 "%s" は入力エラーとして日本語にする', async (detail, expected) => {
    stubFetch(async () => jsonResponse({ detail }, 400))
    const error = await captureError(evaluateLineup(REQUEST))
    expect(error.kind).toBe('input')
    expect(error.message).toBe(expected)
  })

  test('500 はサーバーのエラー', async () => {
    stubFetch(async () => new Response('Internal Server Error', { status: 500 }))
    const error = await captureError(evaluateLineup(REQUEST))
    expect(error.kind).toBe('api')
    expect(error.message).toContain('ステータス 500')
  })

  test.each([502, 503, 504])('%d は通信エラー (プロキシがバックエンドに届かない)', async (status) => {
    stubFetch(async () => new Response('', { status }))
    const error = await captureError(fetchPresets())
    expect(error.kind).toBe('network')
  })

  test('fetch 自体の失敗は通信エラー', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = await captureError(fetchPresets())
    expect(error.kind).toBe('network')
    expect(error.status).toBeNull()
  })

  test('中断はキャンセルとして扱う', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    const error = await captureError(evaluateLineup(REQUEST, new AbortController().signal))
    expect(error.kind).toBe('aborted')
  })

  test('JSON でない成功応答は通信エラー', async () => {
    stubFetch(async () => new Response('<html></html>', { status: 200 }))
    const error = await captureError(fetchPresets())
    expect(error.kind).toBe('network')
  })
})

import { useEffect, useState } from 'react'

import { ApiError, fetchBatterMetrics } from './api/client'
import type { BatterMetrics, BatterStats } from './api/types'
import type { NameIssue } from './names'
import { displayName, type BatterSlot } from './state/lineup'
import { parseAndValidate } from './validation'

/** 入力が落ち着いてから API を呼ぶまでの待ち時間 (入力のたびに呼ばないため) */
const DEBOUNCE_MS = 300

export type MetricsState =
  | { status: 'idle' }
  /** 表示名に問題があり、API の注意文に正しい名前を出せないので、呼んでいない */
  | { status: 'blocked' }
  | { status: 'loading' }
  | { status: 'done'; batters: Record<string, BatterMetrics> }
  | { status: 'error'; message: string }

/**
 * 打者ごとの指標と注意を POST /batters/metrics から取得する。
 * 成績がそろって検証を通った打者だけを送る。表示する数値はすべて API の値。
 */
export function useBatterMetrics(slots: BatterSlot[], nameIssues: Record<string, NameIssue>): MetricsState {
  const batters: Record<string, BatterStats> = {}
  const names: Record<string, string> = {}
  for (const slot of slots) {
    const { stats } = parseAndValidate(slot.raw)
    if (stats !== null) {
      batters[slot.id] = stats
      names[slot.id] = displayName(slot)
    }
  }
  const hasNameIssue = Object.keys(batters).some((id) => nameIssues[id] !== undefined)
  // 送る内容が同じなら、もう一度は呼ばない (key が同じ間は結果を使い回す)
  const key = Object.keys(batters).length === 0 || hasNameIssue ? null : JSON.stringify({ batters, names })

  const [state, setState] = useState<{ key: string | null; value: MetricsState }>({
    key: null,
    value: { status: 'idle' },
  })

  useEffect(() => {
    if (key === null) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const body = JSON.parse(key) as { batters: Record<string, BatterStats>; names: Record<string, string> }
      fetchBatterMetrics({ batters: body.batters, display_names: body.names }, controller.signal).then(
        (data) => setState({ key, value: { status: 'done', batters: data.batters } }),
        (error: unknown) => {
          if (error instanceof ApiError && error.kind === 'aborted') {
            return
          }
          const message = error instanceof ApiError ? error.message : '指標を読み込めませんでした。'
          setState({ key, value: { status: 'error', message } })
        },
      )
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key])

  if (hasNameIssue) {
    return { status: 'blocked' }
  }
  if (key === null) {
    return { status: 'idle' }
  }
  return state.key === key ? state.value : { status: 'loading' }
}

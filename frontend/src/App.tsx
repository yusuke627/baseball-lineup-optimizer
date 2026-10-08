import { useCallback, useReducer, useRef, useState } from 'react'

import { ApiError, evaluateLineup } from './api/client'
import type { BatterStats, LineupEvaluationResponse, StatKey } from './api/types'
import ErrorBanner, { type DisplayError } from './components/ErrorBanner'
import ErrorSummary, { summarizeErrors, type BatterErrorSummary } from './components/ErrorSummary'
import ResultSummary from './components/ResultSummary'
import StatsTable from './components/StatsTable'
import { findNameIssues } from './names'
import { createInitialLineup, displayName, lineupReducer } from './state/lineup'
import { parseAndValidate } from './validation'

type RunState =
  | { status: 'idle' }
  | { status: 'invalid'; summaries: BatterErrorSummary[] }
  | { status: 'running' }
  // names は実行した時点の表示名 (打者の内部ID → 表示名)。結果の打順を表示名で出すために使う
  | { status: 'done'; result: LineupEvaluationResponse; names: Record<string, string> }
  | { status: 'error'; error: DisplayError }

const UNEXPECTED_ERROR_MESSAGE = '予期しないエラーが発生しました。もう一度お試しください。'

function focusField(fieldId: string) {
  document.getElementById(fieldId)?.focus()
}

export default function App() {
  const [lineup, dispatch] = useReducer(lineupReducer, undefined, createInitialLineup)
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)

  const isRunning = run.status === 'running'
  const nameIssues = findNameIssues(
    lineup.slots.map((slot) => ({ id: slot.id, name: displayName(slot) })),
  )

  // 入力を変えたら、前の入力に対する結果・エラーは消す (画面の結果と入力が食い違わないように)
  const clearRun = useCallback(() => {
    setRun((current) => (current.status === 'idle' ? current : { status: 'idle' }))
  }, [])

  // 表の各行は memo しているので、行に渡す関数は作り直さない (useCallback)
  const handleChange = useCallback(
    (slotId: string, key: StatKey, value: string) => {
      dispatch({ type: 'setStat', slotId, key, value })
      clearRun()
    },
    [clearRun],
  )

  const handleBlur = useCallback((slotId: string, key: StatKey) => {
    dispatch({ type: 'touchStat', slotId, key })
  }, [])

  // 表示名は API の warnings の文にも入るので、変えたら前の結果は消す
  const handleNameChange = useCallback(
    (slotId: string, value: string) => {
      dispatch({ type: 'setName', slotId, value })
      clearRun()
    },
    [clearRun],
  )

  const handleNameBlur = useCallback((slotId: string) => {
    dispatch({ type: 'commitName', slotId })
  }, [])

  async function handleRun() {
    setShowAllErrors(true)

    const summaries = summarizeErrors(lineup.slots, nameIssues)
    if (summaries.length > 0) {
      setRun({ status: 'invalid', summaries })
      focusField(summaries[0].firstFieldId)
      return
    }

    const batters: Record<string, BatterStats> = {}
    const names: Record<string, string> = {}
    for (const slot of lineup.slots) {
      const { stats } = parseAndValidate(slot.raw)
      if (stats === null) {
        return // summarizeErrors がエラーなしと判定しているので、ここには来ない
      }
      batters[slot.id] = stats
      names[slot.id] = displayName(slot)
    }

    const controller = new AbortController()
    controllerRef.current = controller
    setRun({ status: 'running' })
    try {
      const result = await evaluateLineup(
        { batters, input_order: lineup.slots.map((slot) => slot.id), display_names: names },
        controller.signal,
      )
      setRun({ status: 'done', result, names })
    } catch (error) {
      const display: DisplayError =
        error instanceof ApiError
          ? { kind: error.kind, message: error.message }
          : { kind: 'api', message: UNEXPECTED_ERROR_MESSAGE }
      setRun({ status: 'error', error: display })
    } finally {
      controllerRef.current = null
    }
  }

  function handleCancel() {
    controllerRef.current?.abort()
  }

  return (
    <main>
      <h1>打順の得点期待値</h1>
      <p>9人の打順を入力し、入力した打順と最適打順の期待得点を比べます。</p>

      <section aria-labelledby="input-heading">
        <h2 id="input-heading">成績の入力</h2>
        <p>
          表の上から順に1番打者〜9番打者として計算します。各打者のシーズン成績（カウント）を入力してください。打者の表示名は変えられます（20文字まで）。
        </p>
        <StatsTable
          slots={lineup.slots}
          nameIssues={nameIssues}
          showAllErrors={showAllErrors}
          disabled={isRunning}
          onChange={handleChange}
          onBlur={handleBlur}
          onNameChange={handleNameChange}
          onNameBlur={handleNameBlur}
        />
      </section>

      <section aria-labelledby="run-heading" className="run">
        <h2 id="run-heading">計算</h2>
        <div className="run-controls">
          <button type="button" onClick={handleRun} disabled={isRunning}>
            期待得点を計算する
          </button>
          {isRunning && (
            <button type="button" onClick={handleCancel}>
              キャンセル
            </button>
          )}
        </div>
        {isRunning && (
          <p role="status" className="note">
            計算中です。入力した打順の評価と、最適打順の探索を行っています（数秒かかります）。
          </p>
        )}
        {run.status === 'invalid' && <ErrorSummary summaries={run.summaries} onJump={focusField} />}
        {run.status === 'error' && <ErrorBanner error={run.error} />}
      </section>

      {run.status === 'done' && <ResultSummary result={run.result} names={run.names} />}
    </main>
  )
}

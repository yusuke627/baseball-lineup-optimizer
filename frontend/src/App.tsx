import { useCallback, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { ApiError, evaluateLineup } from './api/client'
import type { BatterStats, LineupEvaluationResponse, Preset, StatKey } from './api/types'
import ErrorBanner, { type DisplayError } from './components/ErrorBanner'
import ErrorSummary, { summarizeErrors, type BatterErrorSummary } from './components/ErrorSummary'
import BatterCards from './components/BatterCards'
import BatterWarnings from './components/BatterWarnings'
import DataSources from './components/DataSources'
import DiamondMark from './components/DiamondMark'
import Disclosure from './components/Disclosure'
import OrderList, { type OrderEntry } from './components/OrderList'
import ResultSummary from './components/ResultSummary'
import StepTabs, { focusTab } from './components/StepTabs'
import { lowPaMessages } from './messages'
import { findNameIssues } from './names'
import { createInitialLineup, displayName, isPresetEdited, lineupReducer } from './state/lineup'
import { useBatterMetrics } from './useBatterMetrics'
import { parseAndValidate } from './validation'

type RunState =
  // cleared: 計算したあとに入力・打順を変えたため、前の結果を消した (そのことを画面で知らせる)
  | { status: 'idle'; cleared?: boolean }
  | { status: 'invalid'; summaries: BatterErrorSummary[] }
  | { status: 'running' }
  // names は実行した時点の表示名 (打者の内部ID → 表示名)。結果の打順を表示名で出すために使う
  | { status: 'done'; result: LineupEvaluationResponse; names: Record<string, string> }
  | { status: 'error'; error: DisplayError }

/** 手順のタブ (成績の入力・打順・計算と結果) */
type Step = 'input' | 'order' | 'run'

const UNEXPECTED_ERROR_MESSAGE = '予期しないエラーが発生しました。もう一度お試しください。'

function focusField(fieldId: string) {
  document.getElementById(fieldId)?.focus()
}

export default function App() {
  const [lineup, dispatch] = useReducer(lineupReducer, undefined, createInitialLineup)
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  /** 結果の試合数の切替 (143試合・162試合)。計算し直しても選んだままにする */
  const [games, setGames] = useState(143)
  /** 表示している手順のタブ */
  const [step, setStep] = useState<Step>('input')
  const controllerRef = useRef<AbortController | null>(null)

  const isRunning = run.status === 'running'
  const nameIssues = findNameIssues(
    lineup.slots.map((slot) => ({ id: slot.id, name: displayName(slot) })),
  )
  const namesById: Record<string, string> = Object.fromEntries(
    lineup.slots.map((slot) => [slot.id, displayName(slot)]),
  )

  // 入力や打順を変えたら、前の入力に対する結果・エラーは消す (画面の結果と入力が食い違わないように)。
  // 結果を消したときは、そのことを画面に出す
  const clearRun = useCallback(() => {
    setRun((current) => {
      if (current.status === 'done') {
        return { status: 'idle', cleared: true }
      }
      return current.status === 'idle' ? current : { status: 'idle' }
    })
  }, [])

  const metrics = useBatterMetrics(lineup.slots, nameIssues)
  const orderEntries: OrderEntry[] = lineup.order.map((id) => {
    const slot = lineup.slots.find((candidate) => candidate.id === id)
    return {
      id,
      name: namesById[id],
      unchangedPreset: slot && slot.preset && !isPresetEdited(slot) ? slot.preset : null,
    }
  })

  function handleMove(from: number, to: number) {
    dispatch({ type: 'moveInOrder', from, to })
    clearRun()
  }

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

  function handleCopy(fromId: string, toIds: string[]) {
    dispatch({ type: 'copyStats', fromId, toIds })
    clearRun()
  }

  function handleLoadPreset(slotId: string, preset: Preset, name: string) {
    dispatch({ type: 'loadPreset', slotId, preset, name })
    clearRun()
  }

  function handleRevertPreset(slotId: string) {
    dispatch({ type: 'revertPreset', slotId })
    clearRun()
  }

  // 「手入力する」「編集する」「編集を閉じる」は、成績も表示名も変えないので、結果は消さない
  function handleStartManual(slotId: string) {
    dispatch({ type: 'startManual', slotId })
  }

  function handleSetEditing(slotId: string, editing: boolean) {
    dispatch({ type: 'setEditing', slotId, editing })
  }

  function handleTouchAll(slotId: string) {
    dispatch({ type: 'touchAll', slotId })
  }

  // 「選択を外す」は成績と表示名を初期に戻すので、前の結果は消す
  function handleClearSelection(slotId: string) {
    dispatch({ type: 'clearSelection', slotId })
    clearRun()
  }

  async function handleRun() {
    setShowAllErrors(true)

    const summaries = summarizeErrors(lineup.slots, nameIssues)
    if (summaries.length > 0) {
      setRun({ status: 'invalid', summaries })
      jumpToField(summaries[0].firstFieldId)
      return
    }

    const batters: Record<string, BatterStats> = {}
    const names = namesById
    for (const slot of lineup.slots) {
      const { stats } = parseAndValidate(slot.raw)
      if (stats === null) {
        return // summarizeErrors がエラーなしと判定しているので、ここには来ない
      }
      batters[slot.id] = stats
    }

    const controller = new AbortController()
    controllerRef.current = controller
    setRun({ status: 'running' })
    try {
      const result = await evaluateLineup(
        { batters, input_order: lineup.order, display_names: names },
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

  /** 「次へ」のボタン: 次のタブに切り替え、そのタブにフォーカスを移す */
  function goToStep(next: Step) {
    setStep(next)
    focusTab(next)
  }

  /**
   * 入力欄へ移る (エラーの要約のボタンと、計算を押したときに入力の誤りがあった場合)。
   * 入力欄は「成績の入力」のタブにあるので、先にそのタブを表示してからフォーカスする
   * (隠れたパネルの中の要素にはフォーカスできないため、flushSync で表示を済ませる)
   */
  function jumpToField(fieldId: string) {
    flushSync(() => setStep('input'))
    focusField(fieldId)
  }

  const inputPanel = (
    <>
      <section aria-labelledby="input-heading" className="step">
        <h2 id="input-heading">
          成績の入力
        </h2>
        <p>選手の成績を入力してください。</p>
        <Disclosure name="入力のしかたの説明">
          <p>成績は、率ではなく回数（カウント）で入力します。</p>
          <p>
            犠打だけは空欄にできます（0として扱います）。打者の表示名は変えられます（40文字まで）。MLB の選手の成績は「選手を選ぶ」で入れられます。入力した成績は、ほかの打者にコピーできます。選手データを選んだ打者には、コピーされません。
          </p>
        </Disclosure>
        <BatterCards
          slots={lineup.slots}
          nameIssues={nameIssues}
          metrics={metrics}
          showAllErrors={showAllErrors}
          disabled={isRunning}
          onChange={handleChange}
          onBlur={handleBlur}
          onNameChange={handleNameChange}
          onNameBlur={handleNameBlur}
          onCopy={handleCopy}
          onLoadPreset={handleLoadPreset}
          onRevertPreset={handleRevertPreset}
          onStartManual={handleStartManual}
          onSetEditing={handleSetEditing}
          onClearSelection={handleClearSelection}
          onTouchAll={handleTouchAll}
        />
      </section>
      <NextStepButton label="次へ（打順を決める）" onClick={() => goToStep('order')} />
    </>
  )

  const orderPanel = (
    <>
      <section aria-labelledby="order-heading" className="step">
        <h2 id="order-heading">
          打順
        </h2>
        <p>選んだ選手を、打順に並べ替えてください。</p>
        <Disclosure name="並べ替えのしかたの説明">
          <p>
            上から1番〜9番の順で計算します。取っ手（⋮⋮）のドラッグ、「上へ」「下へ」、移動先の番号で並べ替えられます。各打者の指標はサーバーが計算した値です。
          </p>
        </Disclosure>
        <OrderList entries={orderEntries} metrics={metrics} disabled={isRunning} onMove={handleMove} />
      </section>
      <NextStepButton label="次へ（計算と結果を見る）" onClick={() => goToStep('run')} />
    </>
  )

  const runPanel = (
    <>
      {/* 打席数が少ない打者の一覧は、これまでどおり「計算と結果」のすぐ上に出す */}
      <BatterWarnings entries={orderEntries} metrics={metrics} />

      <section aria-labelledby="run-heading" className="step">
        <h2 id="run-heading">
          計算と結果
        </h2>
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
            計算中です。しばらくかかることがあります。
          </p>
        )}
        {run.status === 'idle' && run.cleared && (
          <p className="note result-cleared" role="status">
            成績・表示名・打順が変わったため、前の計算結果は消しました。もう一度「期待得点を計算する」を押してください。
          </p>
        )}
        {run.status === 'invalid' && <ErrorSummary summaries={run.summaries} onJump={jumpToField} />}
        {run.status === 'error' && <ErrorBanner error={run.error} />}
        {run.status === 'done' && (
          <ResultSummary
            result={run.result}
            names={run.names}
            metrics={metrics}
            games={games}
            onGamesChange={setGames}
            shownWarnings={lowPaMessages(orderEntries, metrics)}
          />
        )}
      </section>
    </>
  )

  return (
    <>
      <main>
        <header className="page-header">
          <h1>
            <DiamondMark />
            <span>打順シミュレーター</span>
          </h1>
        </header>

        <StepTabs
          label="手順"
          selected={step}
          onSelect={setStep}
          tabs={[
            { id: 'input', label: '成績の入力', content: inputPanel },
            { id: 'order', label: '打順', content: orderPanel },
            { id: 'run', label: '計算と結果', content: runPanel },
          ]}
        />
      </main>
      <DataSources />
    </>
  )
}

/** パネルの末尾の「次へ」のボタン。押すと次のタブに切り替え、そのタブにフォーカスを移す */
function NextStepButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="step-next">
      <button type="button" className="button-secondary" onClick={onClick}>
        {label}
      </button>
    </div>
  )
}

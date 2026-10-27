import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'

import type { BatterMetrics, Preset } from '../api/types'
import { formatRate, formatShare } from '../format'
import { warningButtonName } from '../messages'
import type { MetricsState } from '../useBatterMetrics'
import NumberWithUnit from './NumberWithUnit'
import WarningText from './WarningText'

export interface OrderEntry {
  id: string
  name: string
  /** 読み込んだプリセット (参考値を出すため)。編集済み・手入力なら null */
  unchangedPreset: Preset | null
}

interface OrderListProps {
  entries: OrderEntry[]
  metrics: MetricsState
  disabled: boolean
  /** from 番目 (0始まり) の打者を to 番目に動かす */
  onMove: (from: number, to: number) => void
}

/** 並べ替えたあとにフォーカスを戻す操作 (打者の内部ID と、どの操作か) */
type FocusTarget = { id: string; control: 'up' | 'down' | 'move' | 'handle' }

function controlId(id: string, control: FocusTarget['control']): string {
  return `order-${control}-${id}`
}

const INSTRUCTIONS =
  'ドラッグで並べ替えるには、この取っ手にフォーカスがある状態で、スペースキーかエンターキーで持ち上げ、上下の矢印キーで動かし、もう一度スペースキーかエンターキーで置きます。やめるときはエスケープキーを押します。'

/**
 * 打順の一覧。ドラッグ (取っ手を持つ。マウス・タッチ・キーボード) と、各行の「上へ」「下へ」ボタン、
 * 「N番へ移動」で並べ替えられる。ドラッグが使えない環境でも、ボタンと番号の指定だけで全ての操作ができる。
 * 打者ごとに、API が返した指標と注意を表示する (フロントでは計算しない)。
 */
export default function OrderList({ entries, metrics, disabled, onMove }: OrderListProps) {
  const [message, setMessage] = useState('')
  const focusRef = useRef<FocusTarget | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = entries.map((entry) => entry.id)
  const nameOf = (id: string | number) => entries.find((entry) => entry.id === id)?.name ?? String(id)
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1

  // 並べ替えたら、動かした打者の同じ操作にフォーカスを戻す (行の要素が移動するとフォーカスが外れるため)
  useEffect(() => {
    const target = focusRef.current
    if (target !== null) {
      document.getElementById(controlId(target.id, target.control))?.focus()
      focusRef.current = null
    }
  })

  function move(from: number, to: number, control: FocusTarget['control']) {
    if (from === to || to < 0 || to >= entries.length) {
      return
    }
    const id = entries[from].id
    focusRef.current = { id, control }
    onMove(from, to)
    // ドラッグのときは dnd-kit が同じ内容を読み上げるので、二重に読み上げないよう、こちらでは知らせない
    setMessage(control === 'handle' ? '' : `${entries[from].name}を${from + 1}番から${to + 1}番に移動しました。`)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over === null || active.id === over.id) {
      return
    }
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)), 'handle')
  }

  // ドラッグ中の読み上げ (dnd-kit が用意する読み上げ用の領域に出る)
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました。いまは${positionOf(active.id)}番です。`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)}を${positionOf(over.id)}番の位置に動かしています。` : `${nameOf(active.id)}は並びの外にあります。`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}を${positionOf(active.id)}番から${positionOf(over.id)}番に移動しました。`
        : `${nameOf(active.id)}の移動をやめました。`,
    onDragCancel: ({ active }) => `移動をやめました。${nameOf(active.id)}は${positionOf(active.id)}番のままです。`,
  }

  return (
    <>
      <MetricsStatus metrics={metrics} entries={entries} />
      {/* 取っ手の操作の説明は、dnd-kit が読み上げ用の要素に出し、取っ手の aria-describedby で関連づける */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="order-rows">
            {entries.map((entry, index) => (
              <OrderRow
                key={entry.id}
                entry={entry}
                index={index}
                count={entries.length}
                metrics={metrics.status === 'done' ? metrics.batters[entry.id] : undefined}
                disabled={disabled}
                onMove={move}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {/* ボタン・番号の指定・ドラッグで並べ替えた結果を読み上げる */}
      <p className="order-message" role="status" aria-live="polite">
        {message}
      </p>
    </>
  )
}

interface OrderRowProps {
  entry: OrderEntry
  index: number
  count: number
  metrics: BatterMetrics | undefined
  disabled: boolean
  onMove: (from: number, to: number, control: FocusTarget['control']) => void
}

function OrderRow({ entry, index, count, metrics, disabled, onMove }: OrderRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled,
  })
  const reasonUpId = `order-reason-up-${entry.id}`
  const reasonDownId = `order-reason-down-${entry.id}`
  const isFirst = index === 0
  const isLast = index === count - 1
  const position = index + 1
  const reference = entry.unchangedPreset?.reference_metrics ?? null
  // 移動先の選択。打順が変わったら (選んだときの番号と今の番号が違えば)、今の番号に戻す
  const [choice, setChoice] = useState<{ position: number; value: string } | null>(null)
  const target = choice !== null && choice.position === position ? choice.value : String(position)

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'order-row order-row-dragging' : 'order-row'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="order-row-main">
        <button
          type="button"
          id={`order-handle-${entry.id}`}
          ref={setActivatorNodeRef}
          className="order-handle"
          aria-label={`${entry.name}をドラッグして並べ替える（いまは${position}番）`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
        <span className="order-position">{position}番</span>
        <span className="order-name">{entry.name}</span>
      </div>

      <div className="order-row-details">
        <MetricsLine metrics={metrics} />
        {reference && (
          <p className="order-reference">
            参考値（モデルの計算には使っていません）：
            {reference.wOBA !== undefined && <>wOBA {formatRate(reference.wOBA)}</>}
            {reference.wOBA !== undefined && reference.wRC_plus !== undefined && '／'}
            {reference.wRC_plus !== undefined && <>wRC+ {reference.wRC_plus}</>}
          </p>
        )}
        {metrics && metrics.warnings.length > 0 && (
          <ul className="order-warnings">
            {metrics.warnings.map((warning, warningIndex) => (
              <li key={warning} className="message-warning">
                <span className="message-kind">注意：</span>
                {/* API の文の最初の1文を表示し、残りは「説明」のボタンの中へ (文は書き換えない) */}
                <WarningText
                  message={warning}
                  name={warningButtonName(entry.name, warningIndex, metrics.warnings.length)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="order-row-controls">
        <button
          type="button"
          id={controlId(entry.id, 'up')}
          className="button-secondary"
          aria-label={`${entry.name}を上へ（${position}番から${position - 1}番へ）`}
          aria-disabled={isFirst || disabled || undefined}
          aria-describedby={isFirst ? reasonUpId : undefined}
          onClick={() => !isFirst && !disabled && onMove(index, index - 1, 'up')}
        >
          上へ
        </button>
        {isFirst && (
          <span id={reasonUpId} className="visually-hidden">
            1番なので、これより上へは移動できません。
          </span>
        )}
        <button
          type="button"
          id={controlId(entry.id, 'down')}
          className="button-secondary"
          aria-label={`${entry.name}を下へ（${position}番から${position + 1}番へ）`}
          aria-disabled={isLast || disabled || undefined}
          aria-describedby={isLast ? reasonDownId : undefined}
          onClick={() => !isLast && !disabled && onMove(index, index + 1, 'down')}
        >
          下へ
        </button>
        {isLast && (
          <span id={reasonDownId} className="visually-hidden">
            {count}番なので、これより下へは移動できません。
          </span>
        )}
        <label className="order-move">
          <span className="visually-hidden">{entry.name}の</span>移動先
          <select value={target} disabled={disabled} onChange={(event) => setChoice({ position, value: event.target.value })}>
            {Array.from({ length: count }, (_, i) => (
              <option key={i} value={String(i + 1)}>
                {i + 1}番
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          id={controlId(entry.id, 'move')}
          className="button-secondary"
          aria-label={`${entry.name}を${target}番へ移動`}
          disabled={disabled}
          onClick={() => onMove(index, Number(target) - 1, 'move')}
        >
          移動
        </button>
      </div>
    </li>
  )
}

/**
 * 表示する指標の順番と表記。label は画面に出す略号、spoken は読み上げに使う日本語。
 * 値はすべて API が返したもので、ここでは桁や表記をそろえるだけ (計算はしない)
 */
const METRIC_COLUMNS: { label: string; spoken: string; value: (m: BatterMetrics) => string }[] = [
  { label: 'AVG', spoken: '打率', value: (m) => formatRate(m.AVG) },
  { label: 'PA', spoken: '打席', value: (m) => String(m.PA) },
  { label: 'H', spoken: '安打', value: (m) => String(m.H) },
  { label: 'HR', spoken: '本塁打', value: (m) => String(m.HR) },
  { label: 'OBP', spoken: '出塁率', value: (m) => formatRate(m.OBP) },
  { label: 'SLG', spoken: '長打率', value: (m) => formatRate(m.SLG) },
  { label: 'OPS', spoken: 'OPS', value: (m) => formatRate(m.OPS) },
  { label: 'K%', spoken: '三振率', value: (m) => formatShare(m.SO_pct) },
  { label: 'BB%', spoken: '四球率', value: (m) => formatShare(m.BB_pct) },
  { label: 'SB', spoken: '盗塁', value: (m) => String(m.SB) },
]

/**
 * 指標がまだ無い行に置く、見えない仮の値。指標が出る前後で行の高さが変わらないよう、
 * 同じ形の一覧を、ふつうの桁数の値で置いておく (visibility: hidden で見えず、aria-hidden で読み上げない)
 */
const PLACEHOLDER_VALUES: Record<string, string> = {
  AVG: '.000', PA: '000', H: '000', HR: '00', OBP: '.000', SLG: '.000', OPS: '.000', 'K%': '00.0%', 'BB%': '0.0%', SB: '00',
}

function MetricsLine({ metrics }: { metrics: BatterMetrics | undefined }) {
  if (metrics) {
    return (
      <ul className="order-metrics" aria-label="指標">
        {METRIC_COLUMNS.map((column) => (
          <li key={column.label}>
            {/* 画面には略号、読み上げには日本語の名前を使う。略号にマウスを重ねると日本語の名前が出る */}
            <abbr title={column.spoken} aria-hidden="true">
              {column.label}
            </abbr>
            <span className="visually-hidden">{column.spoken}</span> <NumberWithUnit text={column.value(metrics)} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="order-metrics order-metrics-placeholder" aria-hidden="true">
      {METRIC_COLUMNS.map((column) => (
        <li key={column.label}>
          <abbr>{column.label}</abbr> <NumberWithUnit text={PLACEHOLDER_VALUES[column.label]} />
        </li>
      ))}
    </ul>
  )
}

/**
 * 指標の状態の文。各行には出さず、打順の一覧の上に1回だけ出す。
 * 状態が変わったら読み上げる (role="status")。読み込み中は、画面には出さず、読み上げ用の文だけを置く
 */
function MetricsStatus({ metrics, entries }: { metrics: MetricsState; entries: OrderEntry[] }) {
  const waiting =
    metrics.status === 'idle' ||
    metrics.status === 'blocked' ||
    (metrics.status === 'done' && entries.some((entry) => metrics.batters[entry.id] === undefined))
  return (
    <p className="order-status note" role="status" aria-live="polite">
      {waiting && '成績の入力が終わると、指標を表示します。'}
      {metrics.status === 'error' && '指標を読み込めませんでした。'}
      {metrics.status === 'loading' && <span className="visually-hidden">指標を読み込んでいます…</span>}
    </p>
  )
}

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import type { BatterMetrics, Preset, PresetSummary, StatKey } from '../api/types'
import { formatRate } from '../format'
import { warningButtonName } from '../messages'
import { uniqueDisplayName, type NameIssue } from '../names'
import {
  displayName,
  editButtonId,
  hasAnyStat,
  isPresetEdited,
  nameFieldId,
  presetButtonId,
  showsFields,
  statFieldId,
  type BatterSlot,
} from '../state/lineup'
import type { MetricsState } from '../useBatterMetrics'
import { parseAndValidate, STAT_LABELS, type ValidationIssue } from '../validation'
import CopyControls, { type PendingCopy } from './CopyControls'
import { UNSELECTED_MESSAGE } from './ErrorSummary'
import PresetDialog from './PresetDialog'
import PresetInfo from './PresetInfo'
import WarningText from './WarningText'

/**
 * コピーの操作の状態。確認と通知は、操作したカード (cardId) の中に出す。
 * (選手データの読み込みの上書きの確認は、選手データのダイアログの中で行う。ここには読み込んだ通知だけを出す)
 */
interface CopyState {
  pending?: { cardId: string; fromId: string; toIds: string[]; overwrittenNames: string[] }
  notice?: { cardId: string; text: string }
}

const NO_COPY: CopyState = {}

interface BatterCardsProps {
  slots: BatterSlot[]
  /** 表示名に問題のある打者 (キーは打者の内部ID) */
  nameIssues: Record<string, NameIssue>
  /** 打者ごとの指標 (POST /batters/metrics)。選手データの要約に使う */
  metrics: MetricsState
  /** true のとき、まだ触っていない項目の未入力エラーも表示する (実行ボタンを押した後) */
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
  onNameChange: (slotId: string, value: string) => void
  onNameBlur: (slotId: string) => void
  /** fromId の打者の成績を、toIds の打者に写す */
  onCopy: (fromId: string, toIds: string[]) => void
  /** プリセットの成績と表示名 (name) を、その打者に読み込む */
  onLoadPreset: (slotId: string, preset: Preset, name: string) => void
  /** 読み込んだプリセットの成績に戻す */
  onRevertPreset: (slotId: string) => void
  /** 未選択のカードを手入力にする */
  onStartManual: (slotId: string) => void
  /** 選手データのカードの編集を始める・閉じる */
  onSetEditing: (slotId: string, editing: boolean) => void
  /** 未選択に戻す */
  onClearSelection: (slotId: string) => void
  /** すべての項目を触れた扱いにする (隠れていた未入力の誤りも出す) */
  onTouchAll: (slotId: string) => void
}

/** カードの中での項目のまとまり。上から順に並べると、API の項目の順 (STAT_KEYS) と同じになる */
const STAT_GROUPS: { title: string; keys: StatKey[] }[] = [
  { title: '打席・打数', keys: ['PA', 'AB'] },
  { title: '安打', keys: ['H', '2B', '3B', 'HR'] },
  { title: '四死球・三振', keys: ['BB', 'HBP', 'SO'] },
  { title: '犠飛・犠打・併殺打', keys: ['SF', 'SH', 'GIDP'] },
  { title: '盗塁', keys: ['SB', 'CS'] },
]

const SINGLE_FIELD_RULES = new Set(['REQUIRED', 'INTEGER', 'RANGE', 'PA_MIN'])

/** 画面に出すエラーを選ぶ。1つの項目だけのエラーは、その項目に触れた後 (または実行後) に出す */
function visibleErrors(slot: BatterSlot, errors: ValidationIssue[], showAll: boolean) {
  return errors.filter((issue) => {
    if (!SINGLE_FIELD_RULES.has(issue.rule)) {
      return true
    }
    return showAll || slot.touched[issue.fields[0]] === true
  })
}

/**
 * 画面に出す警告を選ぶ。犠打は空欄なら0として扱うため、犠打をまだ入力していない間は
 * 「打席数と内訳の合計が合わない」が先に出てしまう。犠打の欄に触れる (または実行する) までは出さない。
 */
function visibleWarnings(slot: BatterSlot, warnings: ValidationIssue[], showAll: boolean) {
  const waitingForSh = slot.raw.SH.trim() === '' && slot.touched.SH !== true && !showAll
  return waitingForSh ? [] : warnings
}

function statLabel(key: StatKey): string {
  return `${STAT_LABELS[key]}(${key})`
}

/** 選手データの要約に出す指標。label は画面の略号、spoken は読み上げの名前 */
const SUMMARY_COLUMNS: { label: string; spoken: string; value: (m: BatterMetrics | PresetSummary) => string }[] = [
  { label: 'AVG', spoken: '打率', value: (m) => formatRate(m.AVG) },
  { label: 'OBP', spoken: '出塁率', value: (m) => formatRate(m.OBP) },
  { label: 'SLG', spoken: '長打率', value: (m) => formatRate(m.SLG) },
  { label: 'OPS', spoken: 'OPS', value: (m) => formatRate(m.OPS) },
  { label: 'HR', spoken: '本塁打', value: (m) => String(m.HR) },
  { label: 'PA', spoken: '打席', value: (m) => String(m.PA) },
]

/**
 * 9人分のカード。カードの状態は、未選択 (初期) → 選手データ (要約) ／ 手入力。選手データは「編集する」で入力欄を出せる。
 * 入力欄を出すのは、手入力と、選手データの編集中だけ。画面幅に応じて折り返す (横スクロールはしない)
 */
export default function BatterCards({
  slots,
  nameIssues,
  metrics,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
  onNameChange,
  onNameBlur,
  onCopy,
  onLoadPreset,
  onRevertPreset,
  onStartManual,
  onSetEditing,
  onClearSelection,
  onTouchAll,
}: BatterCardsProps) {
  const [copy, setCopy] = useState<CopyState>({})
  /** 選手データを選ぶダイアログを開いているカード (閉じていれば null) */
  const [presetTarget, setPresetTarget] = useState<string | null>(null)
  /** 次の描画のあとでフォーカスを移す要素のID (カードの状態が変わると、ボタンや入力欄が入れ替わるため) */
  const focusRef = useRef<string | null>(null)

  // カードの状態が変わったあとに、決めた要素へフォーカスを移す。
  // 選手データを選んだときは、ダイアログ (子の部品) が閉じたあとで動く (親の effect は子のあとに動く)
  useEffect(() => {
    const target = focusRef.current
    if (target !== null) {
      focusRef.current = null
      document.getElementById(target)?.focus()
    }
  })

  // 入力を変えたら、前のコピーの通知と確認は消す。
  // カードの中身は memo しているので、渡す関数は作り直さない (useCallback)
  const handleChange = useCallback(
    (slotId: string, key: StatKey, value: string) => {
      setCopy(NO_COPY)
      onChange(slotId, key, value)
    },
    [onChange],
  )
  const handleNameChange = useCallback(
    (slotId: string, value: string) => {
      setCopy(NO_COPY)
      onNameChange(slotId, value)
    },
    [onNameChange],
  )

  const nameOf = (slotId: string) => {
    const slot = slots.find((candidate) => candidate.id === slotId)
    return slot ? displayName(slot) : slotId
  }

  function runCopy(fromId: string, toIds: string[], cardId: string) {
    onCopy(fromId, toIds)
    const text =
      toIds.length === 1
        ? `${nameOf(fromId)} の成績を ${nameOf(toIds[0])} にコピーしました。`
        : `${nameOf(fromId)} の成績を、ほかの${toIds.length}人にコピーしました。`
    setCopy({ notice: { cardId, text } })
  }

  /** コピーを始める。コピー先に入力済みの成績があれば、先にカードの中で確認する */
  function requestCopy(fromId: string, toIds: string[], cardId: string) {
    const overwritten = slots.filter((slot) => toIds.includes(slot.id) && hasAnyStat(slot))
    if (overwritten.length === 0) {
      runCopy(fromId, toIds, cardId)
      return
    }
    setCopy({ pending: { cardId, fromId, toIds, overwrittenNames: overwritten.map(displayName) } })
  }

  function runLoadPreset(slotId: string, preset: Preset) {
    // 同じ名前の打者がほかにいれば「 (2)」などを付ける (表示名は重複できないため)
    const others = slots.filter((slot) => slot.id !== slotId).map(displayName)
    const name = uniqueDisplayName(preset.name, others)
    onLoadPreset(slotId, preset, name)
    setCopy({ notice: { cardId: slotId, text: `選手データ「${preset.name}」を読み込みました。` } })
    // 読み込んだら、要約の「編集する」ボタンへ
    focusRef.current = editButtonId(slotId)
  }

  /** ダイアログで選んだプリセットを読み込む (上書きの確認は、ダイアログの中で済んでいる) */
  function choosePreset(preset: Preset) {
    const slotId = presetTarget
    setPresetTarget(null)
    if (slotId !== null) {
      runLoadPreset(slotId, preset)
    }
  }

  function confirmCopy() {
    const pending = copy.pending
    if (pending) {
      runCopy(pending.fromId, pending.toIds, pending.cardId)
    }
  }

  function cancelCopy() {
    const pending = copy.pending
    if (pending) {
      setCopy({
        notice: { cardId: pending.cardId, text: 'コピーをやめました。成績は変えていません。' },
      })
    }
  }

  function revertPreset(slotId: string) {
    onRevertPreset(slotId)
    setCopy({ notice: { cardId: slotId, text: '選手データの値に戻しました。' } })
  }

  function startManual(slotId: string) {
    setCopy(NO_COPY)
    onStartManual(slotId)
    focusRef.current = nameFieldId(slotId)
  }

  function startEditing(slotId: string) {
    setCopy(NO_COPY)
    onSetEditing(slotId, true)
    focusRef.current = nameFieldId(slotId)
  }

  /** 編集を閉じる。誤りがある間は閉じず、直すよう案内する (隠れていた未入力の誤りも出す) */
  function closeEditing(slot: BatterSlot) {
    const hasErrors = parseAndValidate(slot.raw).result.errors.length > 0 || nameIssues[slot.id] !== undefined
    if (hasErrors) {
      onTouchAll(slot.id)
      setCopy({ notice: { cardId: slot.id, text: '誤りを直してから閉じてください。' } })
      return
    }
    setCopy(NO_COPY)
    onSetEditing(slot.id, false)
    focusRef.current = editButtonId(slot.id)
  }

  function clearSelection(slotId: string) {
    onClearSelection(slotId)
    setCopy({ notice: { cardId: slotId, text: '選択を外しました。' } })
    focusRef.current = presetButtonId(slotId)
  }

  function pendingFor(slotId: string): PendingCopy | undefined {
    const pending = copy.pending
    if (pending === undefined || pending.cardId !== slotId) {
      return undefined
    }
    // このカードがコピー先なら「他の打者からコピー」、コピー元なら「ほかの打者にコピー」の確認
    return pending.fromId === slotId
      ? { kind: 'toAll', overwrittenNames: pending.overwrittenNames }
      : { kind: 'from', fromName: nameOf(pending.fromId) }
  }

  const targetSlot = slots.find((slot) => slot.id === presetTarget)
  // 上書きの確認は、利用者が入力した値が消えるときだけ出す (手入力の値、または選手データを編集した値)。
  // 編集していない選手データを選び直すときは、確認しない
  const targetHasValues =
    targetSlot === undefined
      ? false
      : targetSlot.mode === 'preset'
        ? isPresetEdited(targetSlot)
        : hasAnyStat(targetSlot)

  return (
    <div className="batter-cards">
      {slots.map((slot) => {
        const name = displayName(slot)
        const fields = showsFields(slot)
        const headingId = `card-heading-${slot.id}`
        const openDialog = () => setPresetTarget(slot.id)
        return (
          <section className="batter-card" aria-labelledby={headingId} key={slot.id}>
            <h3 id={headingId} className="batter-card-title">
              {name}
            </h3>

            {slot.mode === 'unselected' && (
              <>
                <div className="card-actions">
                  <button
                    type="button"
                    id={presetButtonId(slot.id)}
                    aria-label={`${name}の選手を選ぶ`}
                    aria-haspopup="dialog"
                    disabled={disabled}
                    onClick={openDialog}
                  >
                    選手を選ぶ
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    aria-label={`${name}を手入力する`}
                    disabled={disabled}
                    onClick={() => startManual(slot.id)}
                  >
                    手入力する
                  </button>
                </div>
                {showAllErrors && (
                  <ul className="messages" aria-live="polite">
                    <li className="message-error">
                      <span className="message-kind">入力エラー：</span>
                      {name}：{UNSELECTED_MESSAGE}
                    </li>
                  </ul>
                )}
              </>
            )}

            {slot.mode === 'manual' && (
              <div className="card-actions">
                <button
                  type="button"
                  id={presetButtonId(slot.id)}
                  className="button-secondary"
                  aria-label={`${name}の選手を選ぶ`}
                  aria-haspopup="dialog"
                  disabled={disabled}
                  onClick={openDialog}
                >
                  選手を選ぶ
                </button>
              </div>
            )}

            {slot.mode === 'preset' && slot.preset && (
              <PresetInfo
                preset={slot.preset}
                edited={isPresetEdited(slot)}
                disabled={disabled}
                onRevert={() => revertPreset(slot.id)}
              />
            )}

            {slot.mode === 'preset' && !slot.editing && (
              <>
                <PresetSummaryStats slot={slot} metrics={metrics} />
                {nameIssues[slot.id] && (
                  <p className="message-error" role="status">
                    <span className="message-kind">入力エラー：</span>
                    {name}の{nameIssues[slot.id].message}「編集する」で名前を直せます。
                  </p>
                )}
                <div className="card-actions">
                  <button
                    type="button"
                    id={editButtonId(slot.id)}
                    aria-label={`${name}を編集する`}
                    disabled={disabled}
                    onClick={() => startEditing(slot.id)}
                  >
                    編集する
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    aria-label={`${name}の選手を選び直す`}
                    aria-haspopup="dialog"
                    disabled={disabled}
                    onClick={openDialog}
                  >
                    選び直す
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    aria-label={`${name}の選択を外す`}
                    disabled={disabled}
                    onClick={() => clearSelection(slot.id)}
                  >
                    選択を外す
                  </button>
                </div>
              </>
            )}

            {fields && (
              <BatterFields
                slot={slot}
                nameError={nameIssues[slot.id]?.message}
                showAllErrors={showAllErrors}
                disabled={disabled}
                onChange={handleChange}
                onBlur={onBlur}
                onNameChange={handleNameChange}
                onNameBlur={onNameBlur}
              />
            )}

            {slot.mode === 'preset' && slot.editing && (
              <div className="card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`${name}の編集を閉じる`}
                  disabled={disabled}
                  onClick={() => closeEditing(slot)}
                >
                  編集を閉じる
                </button>
              </div>
            )}

            {/* コピーの操作は、入力欄を出しているカード (手入力・編集中) にだけ出す。通知の領域は、どのカードにも置く */}
            <CopyControls
              slotId={slot.id}
              name={name}
              showControls={fields}
              // コピー元に選べるのは、入力欄を出しているカードだけ
              others={slots
                .filter((other) => other.id !== slot.id && showsFields(other))
                .map((other) => ({ id: other.id, name: displayName(other) }))}
              pending={pendingFor(slot.id)}
              notice={copy.notice?.cardId === slot.id ? copy.notice.text : ''}
              disabled={disabled}
              onCopyFrom={(fromId) => requestCopy(fromId, [slot.id], slot.id)}
              onCopyToAll={() =>
                requestCopy(
                  slot.id,
                  // コピー先にできないのは、選手データの要約のカード (選手データを上書きしてしまうため)
                  slots
                    .filter((other) => other.id !== slot.id && !(other.mode === 'preset' && !other.editing))
                    .map((other) => other.id),
                  slot.id,
                )
              }
              onConfirm={confirmCopy}
              onCancel={cancelCopy}
            />
          </section>
        )
      })}
      <PresetDialog
        open={targetSlot !== undefined}
        targetName={targetSlot ? displayName(targetSlot) : ''}
        targetHasValues={targetHasValues}
        onClose={() => setPresetTarget(null)}
        onChoose={choosePreset}
      />
    </div>
  )
}

/**
 * 選手データの要約の指標。数値は POST /batters/metrics の値 (今の成績に対する値)。
 * まだ指標が無い (読み込み中など) ときは、編集していなければ選手データの要約 (GET /presets の summary) を使う。
 * どちらも無ければ「—」
 */
function PresetSummaryStats({ slot, metrics }: { slot: BatterSlot; metrics: MetricsState }) {
  const fromMetrics = metrics.status === 'done' ? metrics.batters[slot.id] : undefined
  const values = fromMetrics ?? (slot.preset && !isPresetEdited(slot) ? slot.preset.summary : undefined)
  return (
    <ul className="card-summary" aria-label="成績の要約">
      {SUMMARY_COLUMNS.map((column) => (
        <li key={column.label}>
          <abbr title={column.spoken} aria-hidden="true">
            {column.label}
          </abbr>
          <span className="visually-hidden">{column.spoken}</span> {values ? column.value(values) : '—'}
        </li>
      ))}
    </ul>
  )
}

interface BatterFieldsProps {
  slot: BatterSlot
  nameError: string | undefined
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
  onNameChange: (slotId: string, value: string) => void
  onNameBlur: (slotId: string) => void
}

// 入力欄が 9人×14項目あるため、変更のあった打者の入力欄だけを描き直す (memo)。
// そのために、検証もこの中で行う。
const BatterFields = memo(function BatterFields({
  slot,
  nameError,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
  onNameChange,
  onNameBlur,
}: BatterFieldsProps) {
  const name = displayName(slot)
  const { result } = parseAndValidate(slot.raw)
  const errors = visibleErrors(slot, result.errors, showAllErrors)
  const warnings = visibleWarnings(slot, result.warnings, showAllErrors)
  // 未入力は項目ごとに並べると長くなるので、1行にまとめる
  const missingKeys = errors.filter((issue) => issue.rule === 'REQUIRED').map((issue) => issue.fields[0])
  const otherErrors = errors.filter((issue) => issue.rule !== 'REQUIRED')
  const invalidKeys = new Set(errors.flatMap((issue) => issue.fields))
  const hasMessages = nameError !== undefined || errors.length > 0 || warnings.length > 0
  const messagesId = hasMessages ? `messages-${slot.id}` : undefined
  const shHintId = `hint-${slot.id}-SH`

  return (
    <>
      <div className="field name-field">
        <label htmlFor={nameFieldId(slot.id)}>表示名</label>
        <input
          type="text"
          id={nameFieldId(slot.id)}
          autoComplete="off"
          className="name-input"
          aria-label={`${slot.defaultName}の表示名`}
          aria-invalid={nameError !== undefined || undefined}
          aria-describedby={messagesId}
          value={slot.name}
          disabled={disabled}
          onChange={(event) => onNameChange(slot.id, event.target.value)}
          onBlur={() => onNameBlur(slot.id)}
        />
      </div>

      {STAT_GROUPS.map((group) => (
        <fieldset className="stat-group" key={group.title}>
          <legend>{group.title}</legend>
          {group.keys.map((key) => (
            <div className="field" key={key}>
              <label htmlFor={statFieldId(slot.id, key)}>
                {STAT_LABELS[key]}
                <span className="stat-key">{key}</span>
              </label>
              <input
                type="text"
                id={statFieldId(slot.id, key)}
                inputMode="numeric"
                autoComplete="off"
                className="stat-input"
                // 9人分の同じ項目を区別できるよう、読み上げ用の名前には打者の表示名を入れる
                aria-label={`${name} ${statLabel(key)}`}
                aria-invalid={invalidKeys.has(key) || undefined}
                aria-describedby={
                  key === 'SH' ? [shHintId, messagesId].filter(Boolean).join(' ') : messagesId
                }
                value={slot.raw[key]}
                disabled={disabled}
                onChange={(event) => onChange(slot.id, key, event.target.value)}
                onBlur={() => onBlur(slot.id, key)}
              />
              {/* 補足は項目名の横ではなく入力欄の下に置く (項目名と入力欄の高さを、ほかの項目とそろえるため) */}
              {key === 'SH' && (
                <span id={shHintId} className="field-hint">
                  空欄可
                </span>
              )}
            </div>
          ))}
        </fieldset>
      ))}

      {messagesId && (
        <ul id={messagesId} className="messages" aria-live="polite">
          {nameError && (
            <li className="message-error">
              <span className="message-kind">入力エラー：</span>
              {name}の{nameError}
            </li>
          )}
          {missingKeys.length > 0 && (
            <li className="message-error">
              <span className="message-kind">入力エラー：</span>
              {name}の未入力の項目：{missingKeys.map(statLabel).join('、')}
            </li>
          )}
          {otherErrors.map((issue) => (
            <li key={`${issue.rule}-${issue.fields.join('-')}`} className="message-error">
              <span className="message-kind">入力エラー：</span>
              {name}の{issue.message}
            </li>
          ))}
          {warnings.map((issue, index) => (
            <li key={issue.rule} className="message-warning">
              <span className="message-kind">注意：</span>
              {/* 最初の1文を表示し、残りは「説明」のボタンの中へ */}
              <WarningText message={`${name}の${issue.message}`} name={warningButtonName(name, index, warnings.length)} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
})

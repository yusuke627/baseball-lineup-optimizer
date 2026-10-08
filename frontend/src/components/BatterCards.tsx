import { memo, useCallback, useState } from 'react'

import type { StatKey } from '../api/types'
import type { NameIssue } from '../names'
import {
  displayName,
  hasAnyStat,
  nameFieldId,
  statFieldId,
  type BatterSlot,
} from '../state/lineup'
import { parseAndValidate, STAT_LABELS, type ValidationIssue } from '../validation'
import CopyControls, { type PendingCopy } from './CopyControls'

/** コピーの操作の状態。確認と通知は、操作したカード (cardId) の中に出す */
interface CopyState {
  pending?: { cardId: string; fromId: string; toIds: string[]; overwrittenNames: string[] }
  notice?: { cardId: string; text: string }
}

const NO_COPY: CopyState = {}

interface BatterCardsProps {
  slots: BatterSlot[]
  /** 表示名に問題のある打者 (キーは打者の内部ID) */
  nameIssues: Record<string, NameIssue>
  /** true のとき、まだ触っていない項目の未入力エラーも表示する (実行ボタンを押した後) */
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
  onNameChange: (slotId: string, value: string) => void
  onNameBlur: (slotId: string) => void
  /** fromId の打者の成績を、toIds の打者に写す */
  onCopy: (fromId: string, toIds: string[]) => void
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

/** 9人分の成績の入力欄。打者ごとのカードにし、画面幅に応じて折り返す (横スクロールはしない) */
export default function BatterCards({
  slots,
  nameIssues,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
  onNameChange,
  onNameBlur,
  onCopy,
}: BatterCardsProps) {
  const [copy, setCopy] = useState<CopyState>({})

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

  function confirmCopy() {
    if (copy.pending) {
      runCopy(copy.pending.fromId, copy.pending.toIds, copy.pending.cardId)
    }
  }

  function cancelCopy() {
    if (copy.pending) {
      setCopy({
        notice: { cardId: copy.pending.cardId, text: 'コピーをやめました。成績は変えていません。' },
      })
    }
  }

  function pendingFor(slotId: string): PendingCopy | undefined {
    const pending = copy.pending
    if (pending === undefined || pending.cardId !== slotId) {
      return undefined
    }
    // このカードがコピー先なら「他の打者からコピー」、コピー元なら「ほかの全員にコピー」の確認
    return pending.fromId === slotId
      ? { kind: 'toAll', overwrittenNames: pending.overwrittenNames }
      : { kind: 'from', fromName: nameOf(pending.fromId) }
  }

  return (
    <div className="batter-cards">
      {slots.map((slot) => (
        <section className="batter-card" aria-label={displayName(slot)} key={slot.id}>
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
          <CopyControls
            slotId={slot.id}
            name={displayName(slot)}
            others={slots
              .filter((other) => other.id !== slot.id)
              .map((other) => ({ id: other.id, name: displayName(other) }))}
            pending={pendingFor(slot.id)}
            notice={copy.notice?.cardId === slot.id ? copy.notice.text : ''}
            disabled={disabled}
            onCopyFrom={(fromId) => requestCopy(fromId, [slot.id], slot.id)}
            onCopyToAll={() =>
              requestCopy(
                slot.id,
                slots.filter((other) => other.id !== slot.id).map((other) => other.id),
                slot.id,
              )
            }
            onConfirm={confirmCopy}
            onCancel={cancelCopy}
          />
        </section>
      ))}
    </div>
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
          {warnings.map((issue) => (
            <li key={issue.rule} className="message-warning">
              <span className="message-kind">注意：</span>
              {name}の{issue.message}
            </li>
          ))}
        </ul>
      )}
    </>
  )
})

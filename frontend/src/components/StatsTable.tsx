import { memo } from 'react'

import { STAT_KEYS, type StatKey } from '../api/types'
import type { NameIssue } from '../names'
import { displayName, nameFieldId, statFieldId, type BatterSlot } from '../state/lineup'
import { parseAndValidate, STAT_LABELS, type ValidationIssue } from '../validation'

interface StatsTableProps {
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
}

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

export default function StatsTable({
  slots,
  nameIssues,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
  onNameChange,
  onNameBlur,
}: StatsTableProps) {
  return (
    <div className="table-scroll">
      <table className="stats-table">
        <caption>
          9人分の成績（犠打だけ空欄にできます。空欄の犠打は0として扱います）
        </caption>
        <thead>
          <tr>
            <th scope="col">打者（表示名）</th>
            {STAT_KEYS.map((key) => (
              <th scope="col" key={key}>
                <span className="stat-label">{STAT_LABELS[key]}</span>
                <span className="stat-key">{key}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <SlotRows
              key={slot.id}
              slot={slot}
              nameError={nameIssues[slot.id]?.message}
              showAllErrors={showAllErrors}
              disabled={disabled}
              onChange={onChange}
              onBlur={onBlur}
              onNameChange={onNameChange}
              onNameBlur={onNameBlur}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SlotRowsProps {
  slot: BatterSlot
  nameError: string | undefined
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
  onNameChange: (slotId: string, value: string) => void
  onNameBlur: (slotId: string) => void
}

// 入力欄が 9人×14項目あるため、変更のあった打者の行だけを描き直す (memo)。
// そのために、検証もこの行の中で行う。
const SlotRows = memo(function SlotRows({
  slot,
  nameError,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
  onNameChange,
  onNameBlur,
}: SlotRowsProps) {
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

  return (
    <>
      <tr>
        <th scope="row">
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
        </th>
        {STAT_KEYS.map((key) => (
          <td key={key}>
            <input
              type="text"
              id={statFieldId(slot.id, key)}
              inputMode="numeric"
              autoComplete="off"
              className="stat-input"
              aria-label={`${name} ${statLabel(key)}`}
              aria-invalid={invalidKeys.has(key) || undefined}
              aria-describedby={messagesId}
              value={slot.raw[key]}
              disabled={disabled}
              onChange={(event) => onChange(slot.id, key, event.target.value)}
              onBlur={() => onBlur(slot.id, key)}
            />
          </td>
        ))}
      </tr>
      {messagesId && (
        <tr className="messages-row">
          <td colSpan={STAT_KEYS.length + 1}>
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
          </td>
        </tr>
      )}
    </>
  )
})

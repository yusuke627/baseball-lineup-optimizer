import { memo } from 'react'

import { STAT_KEYS, type StatKey } from '../api/types'
import type { BatterSlot } from '../state/lineup'
import { parseAndValidate, STAT_LABELS, type ValidationIssue } from '../validation'

interface StatsTableProps {
  slots: BatterSlot[]
  /** true のとき、まだ触っていない項目の未入力エラーも表示する (実行ボタンを押した後) */
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
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

export default function StatsTable({
  slots,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
}: StatsTableProps) {
  return (
    <div className="table-scroll">
      <table className="stats-table">
        <caption>
          9人分の成績（犠打だけ空欄にできます。空欄の犠打は0として扱います）
        </caption>
        <thead>
          <tr>
            <th scope="col">打者</th>
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
              showAllErrors={showAllErrors}
              disabled={disabled}
              onChange={onChange}
              onBlur={onBlur}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SlotRowsProps {
  slot: BatterSlot
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
}

// 入力欄が 9人×14項目あるため、変更のあった打者の行だけを描き直す (memo)。
// そのために、検証もこの行の中で行う。
const SlotRows = memo(function SlotRows({
  slot,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
}: SlotRowsProps) {
  const { result } = parseAndValidate(slot.raw)
  const errors = visibleErrors(slot, result.errors, showAllErrors)
  const warnings = result.warnings
  const invalidKeys = new Set(errors.flatMap((issue) => issue.fields))
  const hasMessages = errors.length > 0 || warnings.length > 0
  const messagesId = hasMessages ? `messages-${slot.id}` : undefined

  return (
    <>
      <tr>
        <th scope="row">{slot.id}</th>
        {STAT_KEYS.map((key) => (
          <td key={key}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="stat-input"
              aria-label={`${slot.id} ${STAT_LABELS[key]}(${key})`}
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
              {errors.map((issue) => (
                <li key={`${issue.rule}-${issue.fields.join('-')}`} className="message-error">
                  <span className="message-kind">入力エラー：</span>
                  {slot.id}の{issue.message}
                </li>
              ))}
              {warnings.map((issue) => (
                <li key={issue.rule} className="message-warning">
                  <span className="message-kind">注意：</span>
                  {slot.id}の{issue.message}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
})

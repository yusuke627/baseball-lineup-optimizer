import { memo } from 'react'

import type { StatKey } from '../api/types'
import type { NameIssue } from '../names'
import { displayName, nameFieldId, statFieldId, type BatterSlot } from '../state/lineup'
import { parseAndValidate, STAT_LABELS, type ValidationIssue } from '../validation'

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
}: BatterCardsProps) {
  return (
    <div className="batter-cards">
      {slots.map((slot) => (
        <BatterCard
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
    </div>
  )
}

interface BatterCardProps {
  slot: BatterSlot
  nameError: string | undefined
  showAllErrors: boolean
  disabled: boolean
  onChange: (slotId: string, key: StatKey, value: string) => void
  onBlur: (slotId: string, key: StatKey) => void
  onNameChange: (slotId: string, value: string) => void
  onNameBlur: (slotId: string) => void
}

// 入力欄が 9人×14項目あるため、変更のあった打者のカードだけを描き直す (memo)。
// そのために、検証もこのカードの中で行う。
const BatterCard = memo(function BatterCard({
  slot,
  nameError,
  showAllErrors,
  disabled,
  onChange,
  onBlur,
  onNameChange,
  onNameBlur,
}: BatterCardProps) {
  const name = displayName(slot)
  const { result } = parseAndValidate(slot.raw)
  const errors = visibleErrors(slot, result.errors, showAllErrors)
  const warnings = visibleWarnings(slot, result.warnings, showAllErrors)
  // 未入力は項目ごとに並べると長くなるので、1行にまとめる
  const missingKeys = errors.filter((issue) => issue.rule === 'REQUIRED').map((issue) => issue.fields[0])
  const otherErrors = errors.filter((issue) => issue.rule !== 'REQUIRED')
  const invalidKeys = new Set(errors.flatMap((issue) => issue.fields))
  const hasErrors = nameError !== undefined || errors.length > 0
  const hasMessages = hasErrors || warnings.length > 0
  const messagesId = hasMessages ? `messages-${slot.id}` : undefined

  return (
    <section className={hasErrors ? 'batter-card batter-card-error' : 'batter-card'} aria-label={name}>
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
                {key === 'SH' && <span className="stat-hint">空欄可</span>}
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
                aria-describedby={messagesId}
                value={slot.raw[key]}
                disabled={disabled}
                onChange={(event) => onChange(slot.id, key, event.target.value)}
                onBlur={() => onBlur(slot.id, key)}
              />
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
    </section>
  )
})

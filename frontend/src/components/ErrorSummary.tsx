import { STAT_KEYS, type StatKey } from '../api/types'
import type { NameIssue } from '../names'
import { displayName, nameFieldId, statFieldId, type BatterSlot } from '../state/lineup'
import { parseAndValidate, STAT_LABELS } from '../validation'

/** 打者1人分の入力エラーの要約 */
export interface BatterErrorSummary {
  slotId: string
  name: string
  /** エラーの件数 (未入力は1項目を1件と数える) */
  count: number
  /** 要約に出す文 (未入力は1つにまとめる) */
  messages: string[]
  /** 最初にエラーのある入力欄の要素ID */
  firstFieldId: string
}

const MISSING_LABELS_SHOWN = 3

function statLabel(key: StatKey): string {
  return `${STAT_LABELS[key]}(${key})`
}

function missingMessage(keys: StatKey[]): string {
  const shown = keys.slice(0, MISSING_LABELS_SHOWN).map(statLabel).join('、')
  const rest = keys.length - MISSING_LABELS_SHOWN
  return rest > 0 ? `未入力 ${keys.length}項目（${shown} ほか${rest}項目）` : `未入力（${shown}）`
}

/** 入力エラーのある打者だけを、表の順に要約する */
export function summarizeErrors(
  slots: BatterSlot[],
  nameIssues: Record<string, NameIssue>,
): BatterErrorSummary[] {
  const summaries: BatterErrorSummary[] = []
  for (const slot of slots) {
    const nameIssue = nameIssues[slot.id]
    const { errors } = parseAndValidate(slot.raw).result
    if (nameIssue === undefined && errors.length === 0) {
      continue
    }
    const missing = errors.filter((issue) => issue.rule === 'REQUIRED').map((issue) => issue.fields[0])
    const others = errors.filter((issue) => issue.rule !== 'REQUIRED')
    const errorKeys = new Set(errors.flatMap((issue) => issue.fields))
    const firstKey = STAT_KEYS.find((key) => errorKeys.has(key))

    summaries.push({
      slotId: slot.id,
      name: displayName(slot),
      count: errors.length + (nameIssue ? 1 : 0),
      messages: [
        ...(nameIssue ? [nameIssue.message] : []),
        ...(missing.length > 0 ? [missingMessage(missing)] : []),
        ...others.map((issue) => issue.message),
      ],
      firstFieldId:
        nameIssue || firstKey === undefined ? nameFieldId(slot.id) : statFieldId(slot.id, firstKey),
    })
  }
  return summaries
}

interface ErrorSummaryProps {
  summaries: BatterErrorSummary[]
  onJump: (fieldId: string) => void
}

export default function ErrorSummary({ summaries, onJump }: ErrorSummaryProps) {
  const total = summaries.reduce((sum, summary) => sum + summary.count, 0)
  return (
    <div className="banner banner-error" role="alert">
      <strong>入力エラー：</strong>
      {total}件の入力エラーがあります（打者{summaries.length}人）。最初のエラーの欄に移動しました。打者名を押すと、その打者の欄に移動します。
      <ul>
        {summaries.map((summary) => (
          <li key={summary.slotId}>
            <button
              type="button"
              className="link-button"
              onClick={() => onJump(summary.firstFieldId)}
            >
              {summary.name}
            </button>
            （{summary.count}件）：{summary.messages.join(' ／ ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

/** 上書きの確認待ちになっているコピー */
export type PendingCopy =
  | { kind: 'from'; fromName: string }
  | { kind: 'toAll'; overwrittenNames: string[] }
  // プリセットの読み込み (上書きの確認はコピーと同じ場所に出す)
  | { kind: 'preset'; playerName: string }

/** プリセットを読み込むボタンの要素ID。読み込みの確認が終わったら、ここへフォーカスを戻す */
export function presetButtonId(slotId: string): string {
  return `preset-button-${slotId}`
}

interface CopyControlsProps {
  /** このカードの打者の内部ID (要素IDに使う) */
  slotId: string
  /** このカードの打者の表示名 */
  name: string
  /** コピー元に選べる、ほかの打者 */
  others: { id: string; name: string }[]
  /** このカードで確認待ちのコピー (無ければ undefined) */
  pending: PendingCopy | undefined
  /** このカードに出す通知 (コピーした、やめた、など)。無ければ空文字 */
  notice: string
  disabled: boolean
  onCopyFrom: (fromId: string) => void
  onCopyToAll: () => void
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 成績のコピーの操作。写すのは利用者が入力した成績だけで、平均値や架空の成績を入れる機能ではない。
 * 上書きになるときは、ブラウザの標準ダイアログではなく、カードの中で確認する。
 */
export default function CopyControls({
  slotId,
  name,
  others,
  pending,
  notice,
  disabled,
  onCopyFrom,
  onCopyToAll,
  onConfirm,
  onCancel,
}: CopyControlsProps) {
  const [sourceId, setSourceId] = useState('')
  const [localNotice, setLocalNotice] = useState('')
  const selectRef = useRef<HTMLSelectElement>(null)
  const toAllRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  /** 確認を出す前にフォーカスがあった操作。確認が終わったら、そこへフォーカスを戻す */
  const returnFocusRef = useRef<'select' | 'toAll' | null>(null)
  const isPending = pending !== undefined
  /** 出ている確認の種類 (確認が終わったあとに、どこへフォーカスを戻すかを決めるため) */
  const pendingKindRef = useRef<PendingCopy['kind'] | null>(null)

  // 確認を出したら「上書きする」へ、確認が終わったら元の操作へフォーカスを移す (キーボードで続けて操作できるように)
  useEffect(() => {
    if (isPending) {
      confirmRef.current?.focus()
      return
    }
    if (pendingKindRef.current === 'preset') {
      document.getElementById(presetButtonId(slotId))?.focus()
    } else if (returnFocusRef.current !== null) {
      const target = returnFocusRef.current === 'select' ? selectRef.current : toAllRef.current
      target?.focus()
    }
    returnFocusRef.current = null
    pendingKindRef.current = null
  }, [isPending, slotId])

  useEffect(() => {
    if (pending !== undefined) {
      pendingKindRef.current = pending.kind
    }
  }, [pending])

  function handleCopyFrom() {
    if (sourceId === '') {
      setLocalNotice('コピー元の打者を選んでください。')
      return
    }
    setLocalNotice('')
    returnFocusRef.current = 'select'
    onCopyFrom(sourceId)
    setSourceId('')
  }

  function handleCopyToAll() {
    setLocalNotice('')
    returnFocusRef.current = 'toAll'
    onCopyToAll()
  }

  const confirmId = `copy-confirm-${slotId}`
  const sourceFieldId = `copy-source-${slotId}`

  return (
    <div className="copy-controls">
      {pending ? (
        <div className="copy-confirm">
          <p id={confirmId}>
            {pending.kind === 'from' &&
              `${name} には入力済みの成績があります。${pending.fromName} の成績で上書きしますか？`}
            {pending.kind === 'toAll' &&
              `入力済みの成績がある打者が${pending.overwrittenNames.length}人います（${pending.overwrittenNames.join('、')}）。${name} の成績で上書きしますか？`}
            {pending.kind === 'preset' &&
              `${name} には入力済みの成績があります。プリセット「${pending.playerName}」の成績と名前で上書きしますか？`}
          </p>
          <div className="copy-actions">
            <button type="button" ref={confirmRef} aria-describedby={confirmId} onClick={onConfirm}>
              上書きする
            </button>
            <button type="button" className="button-secondary" onClick={onCancel}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="copy-row">
            <div className="field copy-source">
              <label htmlFor={sourceFieldId}>他の打者からコピー</label>
              <select
                id={sourceFieldId}
                ref={selectRef}
                aria-label={`${name}：他の打者からコピー`}
                value={sourceId}
                disabled={disabled}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">コピー元を選ぶ</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="button-secondary"
              aria-label={`${name}：コピーする`}
              disabled={disabled}
              onClick={handleCopyFrom}
            >
              コピーする
            </button>
          </div>
          <button
            type="button"
            ref={toAllRef}
            className="button-secondary"
            aria-label={`${name}：この打者の成績を、ほかの全員にコピー`}
            disabled={disabled}
            onClick={handleCopyToAll}
          >
            この打者の成績を、ほかの全員にコピー
          </button>
        </>
      )}
      {/* コピーの結果を読み上げる。通知が無いときも要素は置いておく (あとから文が入ったときに読み上げられるように) */}
      <p className="copy-notice" role="status" aria-live="polite">
        {localNotice || notice}
      </p>
    </div>
  )
}

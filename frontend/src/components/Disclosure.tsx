import { useId, useState, type ReactNode } from 'react'

interface DisclosureProps {
  /** ボタンに見える文言 (既定は「説明」) */
  label?: string
  /**
   * 読み上げ用の名前。同じ名前のボタンが並ばないよう、場所ごとに変える (例: 「入力のしかたの説明」)。
   * 見える文言 (label) を含めること (見た目と読み上げの名前を一致させるため)。省略すると label を使う
   */
  name?: string
  /** 開いたときに、ボタンの直後に出す中身 */
  children: ReactNode
  className?: string
}

/**
 * その場で開閉する「説明」ボタン (ディスクロージャー)。初期は閉じている。
 * ボタンは aria-expanded で開閉を、aria-controls で中身を示す。中身はボタンの直後に置く (読む順番がずれないように)。
 * ▸ / ▾ は見た目だけで、読み上げない。タブを切り替えても部品はアンマウントされないので、開閉の状態は残る
 */
export default function Disclosure({ label = '説明', name, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <div className={className ? `disclosure ${className}` : 'disclosure'}>
      <button
        type="button"
        className="disclosure-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={name}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> <span className="disclosure-label">{label}</span>
      </button>
      <div id={bodyId} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  )
}

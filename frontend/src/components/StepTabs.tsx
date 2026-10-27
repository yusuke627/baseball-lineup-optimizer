import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface StepTab<T extends string> {
  id: T
  label: string
  content: ReactNode
}

interface StepTabsProps<T extends string> {
  /** タブリストの名前 (読み上げ用) */
  label: string
  tabs: StepTab<T>[]
  selected: T
  onSelect: (id: T) => void
}

export const tabId = (id: string) => `step-tab-${id}`
export const panelId = (id: string) => `step-panel-${id}`

/**
 * 指定したタブにフォーカスを移す。フォーカスによるブラウザのスクロールは止め、
 * 位置合わせは StepTabs の切り替えの処理 (タブの位置まで戻す) に任せる
 */
export function focusTab(id: string) {
  document.getElementById(tabId(id))?.focus({ preventScroll: true })
}

/**
 * 手順を切り替えるタブ (WAI-ARIA のタブのパターン)。
 * - ←/→ で前後のタブへ (端では反対側へ回る)、Home/End で最初・最後のタブへ。矢印で移動したら、すぐに切り替える (自動で有効化)
 * - Tab キーで止まるのは選んでいるタブだけ (roving tabindex)
 * - 選んでいないパネルは hidden で隠すだけで、アンマウントしない (入力・並べ替え・結果などの状態を残すため)
 * - 切り替えたとき、ページがタブより下までスクロールしていたら、タブの位置まで戻す (新しいパネルの先頭が見えるように)
 */
export default function StepTabs<T extends string>({ label, tabs, selected, onSelect }: StepTabsProps<T>) {
  const tablistRef = useRef<HTMLDivElement>(null)
  const previous = useRef(selected)

  useEffect(() => {
    if (previous.current === selected) {
      return // 最初の表示では動かさない
    }
    previous.current = selected
    const tablist = tablistRef.current
    // jsdom には scrollIntoView が無い
    if (tablist && tablist.getBoundingClientRect().top < 0 && typeof tablist.scrollIntoView === 'function') {
      tablist.scrollIntoView({ block: 'start' })
    }
  }, [selected])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length
        break
      case 'ArrowLeft':
        next = (index - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = tabs.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    onSelect(tabs[next].id)
    focusTab(tabs[next].id)
  }

  return (
    <>
      <div role="tablist" aria-label={label} className="step-tabs" ref={tablistRef}>
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={isSelected}
              aria-controls={panelId(tab.id)}
              tabIndex={isSelected ? 0 : -1}
              className="step-tab"
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== selected}
          className="step-panel"
        >
          {tab.content}
        </div>
      ))}
    </>
  )
}

import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { BatterMetrics, LineupEvaluationResponse, StatKey } from './api/types'
import { renderAppInManualEntry } from './test/cards'
import { showTab } from './test/tabs'
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']
const IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']
const TAB_NAMES = ['成績の入力', '打順', '計算と結果']

// テスト用の値 (形は API の応答と同じ)
const METRICS: BatterMetrics = {
  PA: 600, H: 150, HR: 15, SB: 10, CS: 3, AVG: 0.278, OBP: 0.336, SLG: 0.426, OPS: 0.762,
  BB_pct: 0.0667, SO_pct: 0.2, warnings: [], warning_items: [],
}
const RESPONSE: LineupEvaluationResponse = {
  input_order: IDS,
  input_order_runs_per_game: 4.1,
  input_order_runs_n_games: 0,
  best_order: IDS,
  best_order_runs_per_game: 4.2,
  best_order_runs_n_games: 0,
  inefficiency_percent: 2.38,
  runs_lost_per_game: 0.1,
  n_games: 143,
  monte_carlo: { mean: 4.0987, std: 2.9512, min: 0, max: 19, n_trials: 5000 },
  totals_by_games: [
    { n_games: 143, input_order_runs: 111.1, best_order_runs: 222.2, runs_lost: 55.5 },
    { n_games: 162, input_order_runs: 333.3, best_order_runs: 444.4, runs_lost: 66.6 },
  ],
  warnings: [],
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/batters/metrics') {
        const body = JSON.parse(String(init?.body)) as { batters: Record<string, unknown> }
        return json({ batters: Object.fromEntries(Object.keys(body.batters).map((id) => [id, METRICS])) })
      }
      return json(RESPONSE)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const tab = (name: string) => screen.getByRole('tab', { name })
const selectedTab = () => screen.getByRole('tab', { selected: true })
const input = (name: string, key: StatKey) =>
  screen.getByLabelText<HTMLInputElement>(`${name} ${STAT_LABELS[key]}(${key})`)

function fillAll() {
  for (const name of NAMES) {
    for (const [key, value] of Object.entries(VALID) as [StatKey, number][]) {
      fireEvent.change(input(name, key), { target: { value: String(value) } })
    }
  }
}

describe('タブの役割と属性', () => {
  test('tablist の中に3つの tab があり、それぞれが tabpanel と相互に関連づけられている', () => {
    renderAppInManualEntry()
    const tablist = screen.getByRole('tablist', { name: '手順' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['1成績の入力', '2打順', '3計算と結果'])
    // 番号は見た目だけで、タブの名前は手順の名前
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    for (const [index, t] of tabs.entries()) {
      expect(t).toHaveAccessibleName(TAB_NAMES[index])
      const panel = document.getElementById(t.getAttribute('aria-controls') as string) as HTMLElement
      expect(panel).toHaveAttribute('role', 'tabpanel')
      expect(panel).toHaveAttribute('aria-labelledby', t.id)
      // 選んでいないパネルは hidden で隠す (中身はそのまま DOM にある)
      expect(panel.hidden).toBe(index !== 0)
      expect(panel.childElementCount).toBeGreaterThan(0)
    }
  })

  test('Tab キーで止まるのは、選んでいるタブだけ（roving tabindex）', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1])

    // 「手入力する」で表示名の欄に移ったフォーカスを外し、ページの先頭から Tab で進む
    ;(document.activeElement as HTMLElement).blur()
    await user.tab()
    expect(tab('成績の入力')).toHaveFocus()
    // 次の Tab では、ほかのタブではなく、パネルの中の部品へ進む
    await user.tab()
    expect(document.activeElement).not.toHaveAttribute('role', 'tab')
    expect(screen.getByRole('tabpanel')).toContainElement(document.activeElement as HTMLElement)

    showTab('打順')
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([-1, 0, -1])
  })
})

describe('タブのキー操作（矢印で移動したら、すぐに切り替える）', () => {
  test('→ で次、← で前のタブへ。端では反対側へ回る', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    tab('成績の入力').focus()

    await user.keyboard('{ArrowRight}')
    expect(tab('打順')).toHaveFocus()
    expect(selectedTab()).toHaveAccessibleName('打順')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('打順').id)

    await user.keyboard('{ArrowRight}')
    expect(selectedTab()).toHaveAccessibleName('計算と結果')
    await user.keyboard('{ArrowRight}') // 最後から最初へ回る
    expect(tab('成績の入力')).toHaveFocus()
    expect(selectedTab()).toHaveAccessibleName('成績の入力')

    await user.keyboard('{ArrowLeft}') // 最初から最後へ回る
    expect(tab('計算と結果')).toHaveFocus()
    expect(selectedTab()).toHaveAccessibleName('計算と結果')
    await user.keyboard('{ArrowLeft}')
    expect(selectedTab()).toHaveAccessibleName('打順')
  })

  test('Home で最初、End で最後のタブへ', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    tab('成績の入力').focus()

    await user.keyboard('{End}')
    expect(tab('計算と結果')).toHaveFocus()
    expect(selectedTab()).toHaveAccessibleName('計算と結果')
    await user.keyboard('{Home}')
    expect(tab('成績の入力')).toHaveFocus()
    expect(selectedTab()).toHaveAccessibleName('成績の入力')
  })

  test('↑・↓ など、ほかのキーでは切り替えない', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    tab('成績の入力').focus()
    await user.keyboard('{ArrowDown}{ArrowUp}a')
    expect(selectedTab()).toHaveAccessibleName('成績の入力')
  })
})

describe('「次へ」のボタン', () => {
  test('押すと次のタブに切り替わり、そのタブにフォーカスが移る。最後のパネルには無い', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()

    await user.click(screen.getByRole('button', { name: '次へ（打順を決める）' }))
    expect(selectedTab()).toHaveAccessibleName('打順')
    expect(tab('打順')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '次へ（計算と結果を見る）' }))
    expect(selectedTab()).toHaveAccessibleName('計算と結果')
    expect(tab('計算と結果')).toHaveFocus()

    expect(within(screen.getByRole('tabpanel')).queryByRole('button', { name: /^次へ/ })).not.toBeInTheDocument()
  })
})

describe('切り替えても状態が残る', () => {
  test('入力・打順・計算結果・試合数の選択・開いた欄は、タブを行き来しても消えない', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    fillAll()
    fireEvent.change(screen.getByLabelText('打者Aの表示名'), { target: { value: 'Test Name' } })
    fireEvent.blur(screen.getByLabelText('打者Aの表示名'))

    // 打順を並べ替える
    showTab('打順')
    const order = screen.getByRole('region', { name: '2打順' })
    await within(order).findAllByRole('list', { name: '指標' })
    await user.click(within(order).getByRole('button', { name: '打者Iを上へ（9番から8番へ）' }))
    const orderNames = () => [...order.querySelectorAll('.order-name')].map((el) => el.textContent)
    const reordered = ['Test Name', ...NAMES.slice(1, 7), '打者I', '打者H']
    expect(orderNames()).toEqual(reordered)

    // 計算し、162試合を選び、シミュレーションの欄を開く
    showTab('計算と結果')
    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))
    const result = await screen.findByRole('region', { name: '結果' })
    await user.click(within(result).getByRole('radio', { name: '162試合' }))
    await user.click(within(result).getByRole('button', { name: '参考：シミュレーション' }))

    // ほかのタブへ行って戻る
    showTab('成績の入力')
    expect(input('Test Name', 'HR')).toHaveValue('15')
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('Test Name')
    showTab('打順')
    expect(orderNames()).toEqual(reordered)
    showTab('計算と結果')
    expect(screen.getByRole('region', { name: '結果' })).toBe(result) // 同じ要素のまま (作り直していない)
    expect(within(result).getByRole('radio', { name: '162試合' })).toBeChecked()
    expect(within(result).getByRole('button', { name: '参考：シミュレーション' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('「説明」のボタンの開閉も、タブを行き来しても残る', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    const howToInput = screen.getByRole('button', { name: '入力のしかたの説明' })
    await user.click(howToInput)
    showTab('打順')
    const howToOrder = screen.getByRole('button', { name: '並べ替えのしかたの説明' })
    expect(howToOrder).toHaveAttribute('aria-expanded', 'false')
    await user.click(howToOrder)

    showTab('計算と結果')
    showTab('成績の入力')
    expect(howToInput).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(howToInput.getAttribute('aria-controls') as string)).toBeVisible()
    showTab('打順')
    expect(howToOrder).toHaveAttribute('aria-expanded', 'true')
  })
})

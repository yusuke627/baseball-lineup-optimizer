import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { BatterMetrics, LineupEvaluationResponse, StatKey } from './api/types'
import App from './App'
import { showTab } from './test/tabs'
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']
const IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']

// API が返す指標と注意の、テスト用の値 (形は POST /batters/metrics の応答と同じ)
const METRICS: BatterMetrics = {
  PA: 600, H: 150, HR: 15, SB: 10, CS: 3, AVG: 0.278, OBP: 0.336, SLG: 0.426, OPS: 0.762,
  BB_pct: 0.0667, SO_pct: 0.215, warnings: [], warning_items: [],
}
// 打席数が少ない打者の注意 (文は API が作る。ここではテスト用に同じ形の文を用意する)
const LOW_PA_WARNING =
  '打者C: 打席数(PA)=150 は少なめです（目安：200未満）。成績の標本が小さいため、確率の見積もりが実力からずれやすく、打順の結果も変わりやすくなります。計算はそのまま行っています。'
// 打席数と内訳が合わない打者の注意 (「打席数が少ない打者」の一覧には出さない)
const MISMATCH_WARNING = '打者E: 打席数(PA)=610 が、打数+四球+死球+犠飛+犠打の合計=600 と一致しません。'

function metricsFor(id: string): BatterMetrics {
  if (id === 'b3') {
    return {
      ...METRICS, PA: 150, H: 40, AVG: null, OPS: null,
      warnings: [LOW_PA_WARNING], warning_items: [{ code: 'LOW_PA', message: LOW_PA_WARNING }],
    }
  }
  if (id === 'b5') {
    return {
      ...METRICS, PA: 610,
      warnings: [MISMATCH_WARNING], warning_items: [{ code: 'PA_SUM_MISMATCH', message: MISMATCH_WARNING }],
    }
  }
  return METRICS
}

const RESPONSE: LineupEvaluationResponse = {
  input_order: IDS,
  input_order_runs_per_game: 4.1,
  input_order_runs_n_games: 586.3,
  best_order: IDS,
  best_order_runs_per_game: 4.2,
  best_order_runs_n_games: 600.6,
  inefficiency_percent: 2.38,
  runs_lost_per_game: 0.1,
  n_games: 143,
  monte_carlo: null,
  totals_by_games: [],
  warnings: [],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batters/metrics') {
      const body = JSON.parse(String(init?.body)) as { batters: Record<string, unknown> }
      const batters: Record<string, BatterMetrics> = {}
      for (const id of Object.keys(body.batters)) {
        batters[id] = metricsFor(id)
      }
      return json({ batters })
    }
    if (url === '/api/lineup/evaluate') {
      return json(RESPONSE)
    }
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function input(name: string, key: StatKey): HTMLInputElement {
  return screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`)
}

function fillAll() {
  for (const name of NAMES) {
    for (const [key, value] of Object.entries(VALID) as [StatKey, number][]) {
      fireEvent.change(input(name, key), { target: { value: String(value) } })
    }
  }
}

// 打順の欄は「打順」のタブ、計算のボタンは「計算と結果」のタブにある (選んでから探す)
const orderRegion = () => {
  showTab('打順')
  return screen.getByRole('region', { name: '2打順' })
}
const runButton = () => {
  showTab('計算と結果')
  return screen.getByRole('button', { name: '期待得点を計算する' })
}
const orderNames = () => [...orderRegion().querySelectorAll('.order-name')].map((el) => el.textContent)
const button = (name: string) => within(orderRegion()).getByRole('button', { name })
// 並べ替えの結果を知らせる領域 (dnd-kit も別の読み上げ用の領域を持つので、クラスで区別する)
const message = () => orderRegion().querySelector('.order-message') as HTMLElement

describe('ボタンでの並べ替え', () => {
  test('「上へ」「下へ」で1つずつ動き、読み上げ用の文で知らせる。フォーカスは動かした打者に残る', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(button('打者Cを上へ（3番から2番へ）'))
    expect(orderNames()).toEqual(['打者A', '打者C', '打者B', ...NAMES.slice(3)])
    expect(message()).toHaveTextContent('打者Cを3番から2番に移動しました。')
    await waitFor(() => expect(button('打者Cを上へ（2番から1番へ）')).toHaveFocus())

    await user.click(button('打者Aを下へ（1番から2番へ）'))
    expect(orderNames()).toEqual(['打者C', '打者A', '打者B', ...NAMES.slice(3)])
    expect(message()).toHaveTextContent('打者Aを1番から2番に移動しました。')
    await waitFor(() => expect(button('打者Aを下へ（2番から3番へ）')).toHaveFocus())
  })

  test('先頭の「上へ」と末尾の「下へ」は押せず、その理由が読み上げで分かる', async () => {
    const user = userEvent.setup()
    render(<App />)
    const up = button('打者Aを上へ（1番から0番へ）')
    const down = button('打者Iを下へ（9番から10番へ）')
    expect(up).toHaveAttribute('aria-disabled', 'true')
    expect(up).toHaveAccessibleDescription('1番なので、これより上へは移動できません。')
    expect(down).toHaveAttribute('aria-disabled', 'true')
    expect(down).toHaveAccessibleDescription('9番なので、これより下へは移動できません。')

    await user.click(up)
    await user.click(down)
    expect(orderNames()).toEqual(NAMES)
    expect(message()).toBeEmptyDOMElement()
    // 途中の打者のボタンは押せる
    expect(button('打者Bを上へ（2番から1番へ）')).not.toHaveAttribute('aria-disabled')
  })

  test('「移動先」で番号を選んで「移動」を押すと、その番号へ動く（キーボードだけで操作できる）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const select = within(orderRegion()).getByRole('combobox', { name: '打者Gの移動先' })
    await user.selectOptions(select, '2')
    button('打者Gを2番へ移動').focus()
    await user.keyboard('{Enter}')

    expect(orderNames()).toEqual(['打者A', '打者G', '打者B', '打者C', '打者D', '打者E', '打者F', '打者H', '打者I'])
    expect(message()).toHaveTextContent('打者Gを7番から2番に移動しました。')
    await waitFor(() => expect(button('打者Gを2番へ移動')).toHaveFocus())
    // 移動したあとの「移動先」は、今の番号を指す
    expect(within(orderRegion()).getByRole('combobox', { name: '打者Gの移動先' })).toHaveValue('2')
  })

  test('取っ手は、ドラッグの説明が関連づけられたボタン（ドラッグそのものはブラウザで確認する）', () => {
    render(<App />)
    const handle = within(orderRegion()).getByRole('button', { name: '打者Aをドラッグして並べ替える（いまは1番）' })
    expect(handle).toHaveAttribute('aria-roledescription')
    expect(handle).toHaveAccessibleDescription(/スペースキーかエンターキーで持ち上げ/)
  })
})

describe('並べ替えと計算', () => {
  test('並べ替えた打順が、計算の input_order にそのまま入る', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillAll()
    await user.click(button('打者Iを上へ（9番から8番へ）'))
    await user.click(runButton())

    await screen.findByRole('region', { name: '結果' })
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/lineup/evaluate')
    expect(JSON.parse(String(call?.[1]?.body)).input_order).toEqual([
      'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b9', 'b8',
    ])
  })

  test('計算したあとに並べ替えると、前の結果を消して、そのことを知らせる', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillAll()
    await user.click(runButton())
    await screen.findByRole('region', { name: '結果' })

    await user.click(button('打者Bを上へ（2番から1番へ）'))

    // 結果は、隠れたパネルの中にも残っていない
    expect(screen.queryByRole('region', { name: '結果', hidden: true })).not.toBeInTheDocument()
    showTab('計算と結果')
    expect(screen.getByText(/前の計算結果は消しました。もう一度「期待得点を計算する」を押してください。/)).toBeInTheDocument()
  })
})

describe('打者ごとの指標と注意', () => {
  /** 各行の指標の一覧 (行の順) */
  async function metricLists() {
    return waitFor(() => {
      const found = within(orderRegion()).getAllByRole('list', { name: '指標' })
      expect(found).toHaveLength(9)
      return found
    })
  }

  test('指標を決まった順番と表記で、API の値のまま表示する（K%・BB% は小数点以下1桁のパーセント）', async () => {
    render(<App />)
    fillAll()
    const lists = await metricLists()
    const items = within(lists[0]).getAllByRole('listitem')
    // 画面には略号を出す
    expect(items.map((item) => item.querySelector('abbr')?.textContent)).toEqual([
      'AVG', 'PA', 'H', 'HR', 'OBP', 'SLG', 'OPS', 'K%', 'BB%', 'SB',
    ])
    // 読み上げでは日本語の名前になる (略号は読み上げない)
    expect(items.map((item) => item.querySelector('.visually-hidden')?.textContent)).toEqual([
      '打率', '打席', '安打', '本塁打', '出塁率', '長打率', 'OPS', '三振率', '四球率', '盗塁',
    ])
    expect(items[0].querySelector('abbr')).toHaveAttribute('aria-hidden', 'true')
    expect(items[0].querySelector('abbr')).toHaveAttribute('title', '打率')
    expect(lists[0]).toHaveTextContent(
      'AVG打率 .278PA打席 600H安打 150HR本塁打 15OBP出塁率 .336SLG長打率 .426OPSOPS .762K%三振率 21.5%BB%四球率 6.7%SB盗塁 10',
    )
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/batters/metrics')
    expect(JSON.parse(String(call?.[1]?.body)).display_names.b3).toBe('打者C')
  })

  test('安打（H）は API が返した値を表示する。計算できない指標（null）は「—」', async () => {
    render(<App />)
    fillAll()
    const lists = await metricLists()
    // 打者C の入力の安打は 150 だが、API (テスト用) は 40 を返す。画面には API の値が出る
    expect(lists[2]).toHaveTextContent('H安打 40')
    expect(lists[2]).toHaveTextContent('AVG打率 —')
    expect(lists[2]).toHaveTextContent('OPSOPS —')
  })

  test('各打者の行には、すべての注意を出す', async () => {
    render(<App />)
    fillAll()
    await metricLists()
    const rows = [...orderRegion().querySelectorAll('.order-row')] as HTMLElement[]
    expect(within(rows[2]).getByText(LOW_PA_WARNING)).toBeInTheDocument()
    expect(within(rows[4]).getByText(MISMATCH_WARNING)).toBeInTheDocument()
    expect(within(rows[0]).queryByText(/注意：/)).not.toBeInTheDocument()
  })

  test('計算と結果の上には、種類が LOW_PA の注意がある打者だけを「打席数が少ない打者」として出す', async () => {
    render(<App />)
    fillAll()
    showTab('計算と結果')
    const summary = await screen.findByRole('region', { name: '打席数が少ない打者（1人）' })
    expect(within(summary).getByText(LOW_PA_WARNING)).toBeInTheDocument()
    // 打席数と内訳が合わない注意 (PA_SUM_MISMATCH) は、この一覧には出さない
    expect(within(summary).queryByText(MISMATCH_WARNING)).not.toBeInTheDocument()

    // 一覧は「計算と結果」の見出しより前にある
    const resultHeading = screen.getByRole('heading', { name: '3計算と結果' })
    expect(summary.compareDocumentPosition(resultHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('成績がそろうまでは API を呼ばず、その旨を出す', async () => {
    render(<App />)
    expect(within(orderRegion()).getAllByText('成績の入力がそろい、誤りがなくなると、指標を表示します。')).toHaveLength(9)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/batters/metrics')).toBe(false)
  })

  test('表示名が重複している間は、注意の文に正しい名前を出せないので、API を呼ばない', async () => {
    render(<App />)
    fillAll()
    fireEvent.change(screen.getByLabelText('打者Bの表示名'), { target: { value: '打者A' } })
    expect(within(orderRegion()).getAllByText('表示名を直すと、指標を表示します。').length).toBeGreaterThan(0)
  })
})

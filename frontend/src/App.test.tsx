import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { LineupEvaluationResponse, StatKey } from './api/types'
import App from './App'
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const SLOT_IDS = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']

const RESPONSE: LineupEvaluationResponse = {
  input_order: SLOT_IDS,
  input_order_runs_per_game: 4.123456,
  input_order_runs_n_games: 589.654208,
  best_order: [...SLOT_IDS].reverse(),
  best_order_runs_per_game: 4.234567,
  best_order_runs_n_games: 605.543081,
  inefficiency_percent: 2.62391,
  n_games: 143,
  monte_carlo: { mean: 4.1, std: 2.9, min: 0, max: 20, n_trials: 5000 },
  totals_by_games: [
    { n_games: 143, input_order_runs: 589.654208, best_order_runs: 605.543081 },
    { n_games: 162, input_order_runs: 667.999872, best_order_runs: 685.999854 },
  ],
  warnings: [],
}

// 入力欄はラベルで探す。getByRole は呼ぶたびに全要素の役割と名前を計算するため、
// 126個の入力欄を1つずつ探すと数秒かかる
function input(slotId: string, key: StatKey): HTMLInputElement {
  return screen.getByLabelText(`${slotId} ${STAT_LABELS[key]}(${key})`)
}

function fillSlot(slotId: string, stats: Partial<Record<StatKey, number>> = VALID) {
  for (const [key, value] of Object.entries(stats) as [StatKey, number][]) {
    fireEvent.change(input(slotId, key), { target: { value: String(value) } })
  }
}

function fillAll() {
  SLOT_IDS.forEach((slotId) => fillSlot(slotId))
}

function stubFetch(implementation: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(implementation)
  vi.stubGlobal('fetch', mock)
  return mock
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const runButton = () => screen.getByRole('button', { name: '期待得点を計算する' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('入力フォーム', () => {
  test('9人分・14項目の入力欄がある', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: '打順の得点期待値' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(9 * 14)
  })

  test('矛盾した成績は、入力した時点でエラーを表示する', () => {
    render(<App />)
    fillSlot('打者A', { ...VALID, H: 541, SO: 0, GIDP: 0 })

    expect(screen.getByText(/打者Aの安打\(H\)が打数\(AB\)を超えています。/)).toBeInTheDocument()
    expect(input('打者A', 'H')).toHaveAttribute('aria-invalid', 'true')
    expect(input('打者A', 'AB')).toHaveAttribute('aria-invalid', 'true')
    expect(input('打者A', 'BB')).not.toHaveAttribute('aria-invalid')
  })

  test('未入力のエラーは、その欄から離れた後に表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByText(/打席数\(PA\)を入力してください/)).not.toBeInTheDocument()

    await user.click(input('打者A', 'PA'))
    await user.tab()

    expect(screen.getByText(/打者Aの打席数\(PA\)を入力してください。/)).toBeInTheDocument()
  })

  test('打席数と内訳の合計が合わないときは、エラーではなく注意を表示する', () => {
    render(<App />)
    fillSlot('打者B', { ...VALID, PA: 610 })

    const message = screen.getByText(/打者Bの打席数\(PA\)が、打数・四球・死球・犠飛・犠打の合計と一致しません/)
    expect(message).toHaveClass('message-warning')
    expect(input('打者B', 'PA')).not.toHaveAttribute('aria-invalid')
  })
})

describe('計算の実行', () => {
  test('入力に誤りがあると、APIを呼ばずに入力エラーを表示する', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)

    await user.click(runButton())

    expect(fetchMock).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('入力エラー：')).toBeInTheDocument()
    // 実行後は、触っていない欄の未入力エラーも表示する
    expect(screen.getByText(/打者Iの盗塁死\(CS\)を入力してください。/)).toBeInTheDocument()
  })

  test('APIが返した値と打順を表示する', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    await user.click(runButton())

    const result = await screen.findByRole('region', { name: '結果' })
    expect(within(result).getByText('4.123')).toBeInTheDocument()
    expect(within(result).getByText('4.235')).toBeInTheDocument()
    expect(within(result).getByText('2.62%')).toBeInTheDocument()
    expect(within(result).getByText(SLOT_IDS.join(' → '))).toBeInTheDocument()
    expect(within(result).getByText([...SLOT_IDS].reverse().join(' → '))).toBeInTheDocument()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/lineup/evaluate')
    const body = JSON.parse(String(init?.body))
    expect(body.input_order).toEqual(SLOT_IDS)
    expect(body.batters['打者A']).toEqual(VALID)
  })

  test('APIの warnings は、返ってきた文字列をそのまま表示する', async () => {
    const warning = '打者C: 打席数(PA)=610 が、打数+四球+死球+犠飛+犠打の合計=600 と一致しません。'
    stubFetch(async () => jsonResponse({ ...RESPONSE, warnings: [warning] }))
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    await user.click(runButton())

    const result = await screen.findByRole('region', { name: '結果' })
    expect(within(result).getByText(warning)).toBeInTheDocument()
  })

  test('APIの422は、日本語の入力エラーに置き換えて表示する', async () => {
    stubFetch(async () => jsonResponse({ detail: [{ msg: 'Value error, ...' }] }, 422))
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    await user.click(runButton())

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('入力エラー：')).toBeInTheDocument()
    expect(alert).toHaveTextContent('入力された成績に誤りがあるため、計算できませんでした。')
    expect(alert).not.toHaveTextContent('Value error')
  })

  test('APIの500はサーバーのエラー、接続失敗は通信エラーとして区別する', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    stubFetch(async () => new Response('', { status: 500 }))
    await user.click(runButton())
    expect(within(await screen.findByRole('alert')).getByText('サーバーのエラー：')).toBeInTheDocument()

    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await user.click(runButton())
    expect(within(await screen.findByRole('alert')).getByText('通信エラー：')).toBeInTheDocument()
  })

  test('計算中はキャンセルでき、キャンセル後は結果を表示しない', async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    await user.click(runButton())
    expect(runButton()).toBeDisabled()
    expect(screen.getByText(/計算中です/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(await screen.findByText('キャンセル：')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '結果' })).not.toBeInTheDocument()
    expect(runButton()).toBeEnabled()
  })

  test('入力を変えると、前の結果は消える', async () => {
    stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)
    fillAll()
    await user.click(runButton())
    await screen.findByRole('region', { name: '結果' })

    fireEvent.change(input('打者A', 'HR'), { target: { value: '16' } })

    expect(screen.queryByRole('region', { name: '結果' })).not.toBeInTheDocument()
  })
})

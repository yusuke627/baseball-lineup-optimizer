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
// 打者の内部ID (API に送る) と、既定の表示名 (画面に出る)
const SLOT_IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']

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
function input(name: string, key: StatKey): HTMLInputElement {
  return screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`)
}

function nameInput(defaultName: string): HTMLInputElement {
  return screen.getByLabelText(`${defaultName}の表示名`)
}

function fillSlot(name: string, stats: Partial<Record<StatKey, number>> = VALID) {
  for (const [key, value] of Object.entries(stats) as [StatKey, number][]) {
    fireEvent.change(input(name, key), { target: { value: String(value) } })
  }
}

function fillAll() {
  NAMES.forEach((name) => fillSlot(name))
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
  test('9人分の表示名と14項目の入力欄がある', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: '打順の得点期待値' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(9 * (1 + 14))
  })

  test('画面は「成績の入力 → 打順 → 計算と結果」の3つの段階に分かれている', () => {
    render(<App />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['1成績の入力', '2打順', '3計算と結果'])
  })

  test('打者ごとにカードがあり、項目はまとまりごとに分かれている', () => {
    render(<App />)
    const card = screen.getByRole('region', { name: '打者A' })
    expect(within(card).getAllByRole('textbox')).toHaveLength(1 + 14)
    const groups = within(card).getAllByRole('group').map((group) => within(group).getAllByRole('textbox').length)
    expect(groups).toEqual([2, 4, 3, 3, 2]) // 打席・打数／安打／四死球・三振／犠飛・犠打・併殺打／盗塁
    expect(within(card).getByRole('group', { name: '安打' })).toBeInTheDocument()
  })

  test('犠打の「空欄可」は項目名に入れず、入力欄の補足として関連づける', () => {
    render(<App />)
    const card = screen.getByRole('region', { name: '打者A' })
    // 項目名はどの項目も「日本語名 + 記号」だけにする (補足を入れると折り返して、その欄だけ下にずれる)
    const labels = [...card.querySelectorAll('.stat-group label')].map((label) => label.textContent)
    expect(labels).toContain('犠打SH')
    expect(labels.every((text) => !text?.includes('空欄可'))).toBe(true)

    expect(input('打者A', 'SH')).toHaveAccessibleDescription('空欄可')
    expect(input('打者A', 'SF')).not.toHaveAccessibleDescription()

    // エラーが出ているときは、補足とエラーの文の両方を関連づける
    fillSlot('打者A', { AB: 100, H: 101 })
    expect(input('打者A', 'SH')).toHaveAccessibleDescription(/^空欄可 .*安打\(H\)が打数\(AB\)を超えています。/)
  })

  test('打順の欄には、表示名が入力の順に並ぶ', () => {
    render(<App />)
    const order = screen.getByRole('region', { name: '2打順' })
    const names = () => within(order).getAllByRole('listitem').map((item) => item.textContent)
    expect(names()).toEqual(NAMES)

    fireEvent.change(nameInput('打者C'), { target: { value: 'Luis Arraez' } })
    expect(names()).toEqual(['打者A', '打者B', 'Luis Arraez', ...NAMES.slice(3)])
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
    expect(screen.queryByText(/未入力の項目/)).not.toBeInTheDocument()

    await user.click(input('打者A', 'PA'))
    await user.tab()

    expect(screen.getByText(/打者Aの未入力の項目：打席数\(PA\)/)).toBeInTheDocument()
  })

  test('打席数と内訳の合計が合わないときは、エラーではなく注意を表示する', () => {
    render(<App />)
    fillSlot('打者B', { ...VALID, PA: 610 })

    const message = screen.getByText(/打者Bの打席数\(PA\)が、打数・四球・死球・犠飛・犠打の合計と一致しません/)
    expect(message).toHaveClass('message-warning')
    expect(input('打者B', 'PA')).not.toHaveAttribute('aria-invalid')
  })

  test('ほかの欄が空欄でも、打数と安打だけで矛盾のエラーを表示する', () => {
    render(<App />)
    fillSlot('打者A', { AB: 100, H: 101 })

    expect(screen.getByText(/打者Aの安打\(H\)が打数\(AB\)を超えています。/)).toBeInTheDocument()
    expect(input('打者A', 'H')).toHaveAttribute('aria-invalid', 'true')
    // 触っていない欄の未入力エラーは、まだ出さない
    expect(screen.queryByText(/未入力の項目/)).not.toBeInTheDocument()
  })

  test('犠打の欄に触れるまでは、打席数と内訳の不一致の注意を出さない', async () => {
    const user = userEvent.setup()
    render(<App />)
    // 犠打を入れれば合計が合う成績 (540+40+10+5+5=600) を、犠打だけ空欄にして入力する
    fillSlot('打者A', { PA: 600, AB: 540, BB: 40, HBP: 10, SF: 5 })
    expect(screen.queryByText(/合計と一致しません/)).not.toBeInTheDocument()

    await user.click(input('打者A', 'SH'))
    await user.tab()
    expect(screen.getByText(/打者Aの打席数\(PA\)が、.*合計と一致しません/)).toBeInTheDocument()

    fireEvent.change(input('打者A', 'SH'), { target: { value: '5' } })
    expect(screen.queryByText(/合計と一致しません/)).not.toBeInTheDocument()
  })
})

describe('打者の表示名', () => {
  test('表示名を変えると、入力欄のラベル・エラーの文・APIに送る表示名・結果の打順に反映される', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    fireEvent.change(nameInput('打者A'), { target: { value: ' Aaron Judge ' } })
    fireEvent.blur(nameInput('打者A'))
    expect(nameInput('打者A')).toHaveValue('Aaron Judge') // 前後の空白は除く
    expect(input('Aaron Judge', 'PA')).toHaveValue('600')

    await user.click(runButton())

    const result = await screen.findByRole('region', { name: '結果' })
    expect(within(result).getByText(['Aaron Judge', ...NAMES.slice(1)].join(' → '))).toBeInTheDocument()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.input_order).toEqual(SLOT_IDS) // 内部IDは変わらない
    expect(body.display_names.b1).toBe('Aaron Judge')
  })

  test('空欄のまま欄を離れると、既定の名前に戻す', () => {
    render(<App />)
    fireEvent.change(nameInput('打者B'), { target: { value: '   ' } })
    fireEvent.blur(nameInput('打者B'))
    expect(nameInput('打者B')).toHaveValue('打者B')
  })

  test('表示名が重複していると、入力エラーにしてAPIを呼ばない', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)
    fillAll()

    fireEvent.change(nameInput('打者B'), { target: { value: '打者A' } })
    expect(nameInput('打者A')).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput('打者B')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText(/表示名がほかの打者と重複しています/)).toHaveLength(2)

    await user.click(runButton())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('2件の入力エラーがあります（打者2人）')
    expect(nameInput('打者A')).toHaveFocus()
  })

  test('41文字以上の表示名は入力エラーにする', () => {
    render(<App />)
    fireEvent.change(nameInput('打者A'), { target: { value: 'あ'.repeat(41) } })
    expect(screen.getByText(/表示名は40文字以内で入力してください。/)).toBeInTheDocument()

    fireEvent.change(nameInput('打者A'), { target: { value: 'あ'.repeat(40) } })
    expect(screen.queryByText(/表示名は40文字以内/)).not.toBeInTheDocument()
  })

  test('表示名を変えると、前の結果は消える', async () => {
    stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)
    fillAll()
    await user.click(runButton())
    await screen.findByRole('region', { name: '結果' })

    fireEvent.change(nameInput('打者A'), { target: { value: '一番' } })

    expect(screen.queryByRole('region', { name: '結果' })).not.toBeInTheDocument()
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
    // 実行後は、触っていない欄の未入力エラーも、打者ごとに1行にまとめて表示する
    expect(screen.getByText(/打者Iの未入力の項目：.*盗塁死\(CS\)/)).toBeInTheDocument()
  })

  test('入力エラーは打者ごとに要約し、最初のエラーの欄にフォーカスを移す', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(RESPONSE))
    const user = userEvent.setup()
    render(<App />)
    NAMES.filter((name) => name !== '打者C' && name !== '打者E').forEach((name) => fillSlot(name))
    fillSlot('打者C', { ...VALID, H: 541, SO: 0, GIDP: 0 })
    const withoutHrAndCs: Partial<Record<StatKey, number>> = { ...VALID }
    delete withoutHrAndCs.HR
    delete withoutHrAndCs.CS
    fillSlot('打者E', withoutHrAndCs)

    await user.click(runButton())

    expect(fetchMock).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('3件の入力エラーがあります（打者2人）')
    const items = within(alert).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('打者C（1件）：安打(H)が打数(AB)を超えています。')
    expect(items[1]).toHaveTextContent('打者E（2件）：未入力（本塁打(HR)、盗塁死(CS)）')
    // 最初のエラーの欄 (打者C の打数。項目の並び順で最初にエラーに関係する欄)
    expect(input('打者C', 'AB')).toHaveFocus()

    // 要約の打者名を押すと、その打者の最初のエラーの欄に移る
    await user.click(within(alert).getByRole('button', { name: '打者E' }))
    expect(input('打者E', 'HR')).toHaveFocus()
  })

  test('未入力が多いときは、要約では項目名を3つまでにして残りは件数で示す', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(runButton())

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('117件の入力エラーがあります（打者9人）')
    expect(within(alert).getAllByRole('listitem')[0]).toHaveTextContent(
      '打者A（13件）：未入力 13項目（打席数(PA)、打数(AB)、安打(H) ほか10項目）',
    )
    expect(input('打者A', 'PA')).toHaveFocus()
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
    // API は打順を内部IDで返す。画面には表示名で出す
    expect(within(result).getByText(NAMES.join(' → '))).toBeInTheDocument()
    expect(within(result).getByText([...NAMES].reverse().join(' → '))).toBeInTheDocument()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/lineup/evaluate')
    const body = JSON.parse(String(init?.body))
    expect(body.input_order).toEqual(SLOT_IDS)
    expect(body.batters.b1).toEqual(VALID)
    expect(body.display_names).toEqual(Object.fromEntries(SLOT_IDS.map((id, i) => [id, NAMES[i]])))
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

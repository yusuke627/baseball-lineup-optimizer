// 段階9D: 成績の入力のカードの状態 (未選択 → 手入力)。選手データを使う場面は preset.test.tsx で確かめる
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { LineupEvaluationResponse, StatKey } from './api/types'
import App from './App'
import { startManualEntry } from './test/cards'
import { showTab } from './test/tabs'
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']
const IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']

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
  monte_carlo: null,
  totals_by_games: [],
  warnings: [],
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) =>
    url === '/api/lineup/evaluate'
      ? new Response(JSON.stringify(RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response('{}', { status: 404 }),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const card = (name: string) => screen.getByRole('region', { name })
const input = (name: string, key: StatKey) => screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`)

function fill(name: string) {
  for (const [key, value] of Object.entries(VALID) as [StatKey, number][]) {
    fireEvent.change(input(name, key), { target: { value: String(value) } })
  }
}

describe('初めの状態（9人とも未選択）', () => {
  test('各カードには、見出しと「選手を選ぶ」「手入力する」の2つのボタンだけがあり、入力欄は出さない', () => {
    render(<App />)
    const input = screen.getByRole('tabpanel')
    expect(within(input).queryAllByRole('textbox')).toHaveLength(0)
    for (const name of NAMES) {
      const c = card(name)
      expect(within(c).getByRole('heading', { level: 3, name })).toBeInTheDocument()
      expect(within(c).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
        `${name}の選手を選ぶ`,
        `${name}を手入力する`,
      ])
      // 見える文言は短く、読み上げの名前に打者名を入れる
      expect(within(c).getByRole('button', { name: `${name}の選手を選ぶ` })).toHaveTextContent(/^選手を選ぶ$/)
      expect(within(c).getByRole('button', { name: `${name}を手入力する` })).toHaveTextContent(/^手入力する$/)
    }
  })
})

describe('手入力', () => {
  test('「手入力する」で、表示名と14項目の入力欄を出し、フォーカスは表示名の欄へ移る', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '打者Cを手入力する' }))
    expect(within(card('打者C')).getAllByRole('textbox')).toHaveLength(1 + 14)
    expect(screen.getByLabelText('打者Cの表示名')).toHaveFocus()
    // 手入力のカードにも「選手を選ぶ」がある。「手入力する」は無くなる
    expect(within(card('打者C')).getByRole('button', { name: '打者Cの選手を選ぶ' })).toBeInTheDocument()
    expect(within(card('打者C')).queryByRole('button', { name: '打者Cを手入力する' })).not.toBeInTheDocument()
    // ほかのカードは未選択のまま
    expect(within(card('打者D')).queryAllByRole('textbox')).toHaveLength(0)
  })

  test('9人とも手入力して計算すると、API に送る形と値は今までと同じ', async () => {
    const user = userEvent.setup()
    render(<App />)
    startManualEntry()
    NAMES.forEach(fill)
    showTab('計算と結果')
    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))
    await screen.findByRole('region', { name: '結果' })
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/lineup/evaluate')
    const body = JSON.parse(String(call?.[1]?.body))
    expect(Object.keys(body).sort()).toEqual(['batters', 'display_names', 'input_order'])
    expect(body.input_order).toEqual(IDS)
    expect(body.batters.b1).toEqual(VALID)
    expect(body.display_names).toEqual(Object.fromEntries(IDS.map((id, i) => [id, NAMES[i]])))
  })
})

describe('未選択のまま計算したとき', () => {
  test('入力エラーとして、カードと要約に「選手を選ぶか、手入力してください。」を出し、最初のカードの「選手を選ぶ」へ移る', async () => {
    const user = userEvent.setup()
    render(<App />)
    // 打者C と 打者F だけ未選択のまま
    startManualEntry(...NAMES.filter((name) => name !== '打者C' && name !== '打者F'))
    NAMES.filter((name) => name !== '打者C' && name !== '打者F').forEach(fill)
    showTab('計算と結果')
    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))

    expect(fetchMock.mock.calls.some(([url]) => url === '/api/lineup/evaluate')).toBe(false)
    expect(screen.getByRole('button', { name: '打者Cの選手を選ぶ' })).toHaveFocus()
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('成績の入力')
    expect(card('打者C')).toHaveTextContent('入力エラー：打者C：選手を選ぶか、手入力してください。')
    expect(card('打者F')).toHaveTextContent('入力エラー：打者F：選手を選ぶか、手入力してください。')

    showTab('計算と結果')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('2件の入力エラーがあります（打者2人）')
    const items = within(alert).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      '打者C（1件）：選手を選ぶか、手入力してください。',
      '打者F（1件）：選手を選ぶか、手入力してください。',
    ])
    // 要約の打者名を押すと、そのカードの「選手を選ぶ」へ移る
    await user.click(within(alert).getByRole('button', { name: '打者F' }))
    expect(screen.getByRole('button', { name: '打者Fの選手を選ぶ' })).toHaveFocus()
  })
})

describe('タブを切り替えても状態が残る', () => {
  test('手入力のカードと入力した値は、タブを行き来しても残る', () => {
    render(<App />)
    startManualEntry('打者A')
    fireEvent.change(input('打者A', 'HR'), { target: { value: '33' } })
    showTab('打順')
    showTab('計算と結果')
    showTab('成績の入力')
    expect(input('打者A', 'HR')).toHaveValue('33')
    expect(within(card('打者B')).getByRole('button', { name: '打者Bを手入力する' })).toBeInTheDocument()
  })
})

describe('コピー（手入力のカード同士）', () => {
  test('未選択のカードにはコピーの操作を出さず、手入力のカードのコピー元には手入力のカードだけが出る', () => {
    render(<App />)
    startManualEntry('打者A', '打者B')
    expect(within(card('打者C')).queryByRole('combobox')).not.toBeInTheDocument()
    const options = [...within(screen.getByLabelText('打者A：他の打者からコピー')).getAllByRole('option')].map(
      (option) => option.textContent,
    )
    expect(options).toEqual(['コピー元を選ぶ', '打者B'])
  })
})

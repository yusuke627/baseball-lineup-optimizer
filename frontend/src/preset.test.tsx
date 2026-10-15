import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Preset, PresetTeams, StatKey } from './api/types'
import App from './App'
import { STAT_LABELS } from './validation'

// テスト用の合成のプリセット (実在の選手・球団・出典の記録ではない)
const STATS_A: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}

function preset(id: string, name: string, overrides: Partial<Preset> = {}): Preset {
  return {
    id,
    name,
    team: 'Test Team A',
    season: 2025,
    league: 'MLB',
    verified: false,
    source: {
      provider: 'Lahman Baseball Database (SABR)',
      url: 'https://example.com/lahman',
      retrieved_at: '2026-01-01',
    },
    stats: STATS_A,
    summary: { PA: 600, HR: 15, AVG: 0.278, OBP: 0.336, SLG: 0.426, SB: 10, CS: 3, SB_pct: 0.769 },
    reference_metrics: null,
    team_info: { code: 'XAA', name: 'Test Team A', league: 'AL' },
    ...overrides,
  }
}

const ALPHA = preset('alpha_2025', 'Test Alpha')
const BETA = preset('beta_2025', 'Test Beta', { stats: { ...STATS_A, HR: 30, H: 160 } })
const MOVED = preset('moved_2025', 'Test Moved', {
  team_info: { code: 'XBB', name: 'Test Team B', league: 'NL' },
  teams_played: [
    { code: 'XAA', name: 'Test Team A' },
    { code: 'XBB', name: 'Test Team B' },
  ],
})
const VERIFIED = preset('verified_2025', 'Test Verified', {
  verified: true,
  source: { provider: 'Test Source', url: 'http://example.com/not-https', retrieved_at: '2026-01-02' },
  team_info: { code: 'XBB', name: 'Test Team B', league: 'NL' },
  reference_metrics: {
    wOBA: 0.345,
    wRC_plus: 120,
    season: 2025,
    source: { provider: 'Test Reference', url: 'https://example.com/reference' },
    retrieved_at: '2026-01-03',
  },
})

const TEAMS: PresetTeams = {
  season: 2025,
  leagues: [
    { league: 'AL', teams: [{ code: 'XAA', name: 'Test Team A', league: 'AL', count: 2 }] },
    { league: 'NL', teams: [{ code: 'XBB', name: 'Test Team B', league: 'NL', count: 2 }] },
  ],
  without_team: 0,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

function stubPresetApi(overrides: { teams?: () => Response } = {}) {
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/api/presets/seasons') {
      return json({ league: 'mlb', seasons: [2024, 2025] })
    }
    if (url.pathname === '/api/presets/teams') {
      return overrides.teams ? overrides.teams() : json(TEAMS)
    }
    if (url.pathname === '/api/presets') {
      const team = url.searchParams.get('team')
      const q = url.searchParams.get('q')
      if (q === 'moved') {
        return json({ total: 1, items: [MOVED] })
      }
      if (q !== null) {
        return json({ total: 57, items: [ALPHA] }) // 上限で切られた場合の表示を確かめる
      }
      if (team === 'XAA') {
        return json({ total: 2, items: [ALPHA, BETA] })
      }
      if (team === 'XBB') {
        return json({ total: 2, items: [MOVED, VERIFIED] })
      }
      return json({ total: 0, items: [] })
    }
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => stubPresetApi())
afterEach(() => vi.unstubAllGlobals())

function input(name: string, key: StatKey): HTMLInputElement {
  return screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`)
}
const card = (name: string) => screen.getByRole('region', { name })
const openButton = (name: string) => screen.getByRole('button', { name: `${name}：プリセットから読み込む` })
const dialog = () => screen.getByRole('dialog', { name: 'プリセットから読み込む' })

async function openAndChooseTeam(user: ReturnType<typeof userEvent.setup>, cardName: string, team: string) {
  await user.click(openButton(cardName))
  await user.click(await within(dialog()).findByRole('button', { name: new RegExp(`^${team} \\([A-Z]+\\)\\d+人$`) }))
}

async function loadPlayer(user: ReturnType<typeof userEvent.setup>, cardName: string, team: string, player: string) {
  await openAndChooseTeam(user, cardName, team)
  await user.click(await within(dialog()).findByRole('button', { name: new RegExp(`^${player}（.*を${cardName}に読み込む$`) }))
}

describe('プリセットの選択ダイアログ', () => {
  test('シーズン（新しい年が既定）と、リーグごとの球団・選手数を表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))

    const d = dialog()
    expect(within(d).getByText('読み込み先：打者A')).toBeInTheDocument()
    await waitFor(() => expect(within(d).getByLabelText('シーズン')).toHaveValue('2025'))
    const al = await within(d).findByRole('region', { name: 'アメリカン・リーグ (AL)' })
    expect(within(al).getByRole('button', { name: 'Test Team A (XAA)2人' })).toBeInTheDocument()
    const nl = within(d).getByRole('region', { name: 'ナショナル・リーグ (NL)' })
    expect(within(nl).getByRole('button', { name: 'Test Team B (XBB)2人' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/presets/teams?league=mlb&season=2025')
  })

  test('球団を選ぶと、その球団の選手を API の値で表示する（率は .xxx の形）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAndChooseTeam(user, '打者A', 'Test Team A')

    const d = dialog()
    expect(await within(d).findByRole('heading', { name: 'Test Team A (XAA) の選手' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: /Test Team A/, pressed: true })).toBeInTheDocument()
    expect(within(d).getAllByText(/打率 \.278 ／ 出塁率 \.336 ／ 長打率 \.426 ／\s*本塁打 15 ／ 打席 600/)).toHaveLength(2)
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/presets?league=mlb&season=2025&team=XAA')
  })

  test('キーボードだけで、球団 → 選手と選んで読み込める', async () => {
    const user = userEvent.setup()
    render(<App />)
    openButton('打者A').focus()
    await user.keyboard('{Enter}')

    const teamButton = await within(dialog()).findByRole('button', { name: /Test Team A/ })
    teamButton.focus()
    await user.keyboard('{Enter}')
    const load = await within(dialog()).findByRole('button', { name: 'Test Alpha（Test Team A (XAA)）を打者Aに読み込む' })
    load.focus()
    await user.keyboard('{Enter}')

    expect(input('Test Alpha', 'PA')).toHaveValue('600')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('名前で検索でき、上限で切られたときは総数と一緒に知らせる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))
    const d = dialog()
    await user.type(within(d).getByLabelText('選手名で検索（すべての球団）'), 'test')
    await user.click(within(d).getByRole('button', { name: '検索' }))

    expect(await within(d).findByText('57人のうち、名前順で最初の1人を表示しています。名前をもう少し詳しく入力してください。')).toBeInTheDocument()
    expect(within(d).getByRole('heading', { name: '「test」の検索結果' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/presets?league=mlb&season=2025&q=test')
  })

  test('移籍した選手には「年間合計（複数球団）」と在籍した球団を文字で示す', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))
    const d = dialog()
    await user.type(within(d).getByLabelText('選手名で検索（すべての球団）'), 'moved')
    await user.keyboard('{Enter}')

    const button = await within(d).findByRole('button', { name: 'Test Moved（Test Team B (XBB)）を打者Aに読み込む' })
    // 読み込むボタンの説明に含めて、読み上げでも伝わるようにする
    expect(button).toHaveAccessibleDescription(/年間合計（複数球団）：在籍した球団は Test Team A \(XAA\) → Test Team B \(XBB\)/)

    await user.click(button)
    expect(within(card('Test Moved')).getByText(/年間合計（複数球団）/)).toBeInTheDocument()
  })

  test('球団の一覧を読み込めないときは、エラーを表示する', async () => {
    stubPresetApi({ teams: () => new Response('', { status: 500 }) })
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))
    expect(await within(dialog()).findByText(/サーバーでエラーが発生しました（ステータス 500）/)).toBeInTheDocument()
  })

  test('「閉じる」で、何も読み込まずに閉じる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))
    await user.click(within(dialog()).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(input('打者A', 'PA')).toHaveValue('')
  })
})

describe('カードへの読み込み', () => {
  test('成績14項目と名前が入り、プリセットの情報と出典を表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')

    for (const [key, value] of Object.entries(STATS_A) as [StatKey, number][]) {
      expect(input('Test Alpha', key)).toHaveValue(String(value))
    }
    const c = card('Test Alpha')
    expect(within(c).getByText(/プリセット：/).closest('p')).toHaveTextContent(
      'プリセット：Test Alpha（2025年、Test Team A (XAA)）',
    )
    const source = within(c).getByText(/出典：/)
    // リンクの文字には、読み上げ用の「（新しいタブで開きます）」が続く
    expect(source).toHaveTextContent(/^出典：Lahman Baseball Database \(SABR\)（新しいタブで開きます） \/ CC BY-SA 3.0（取得日 2026-01-01）/)
    expect(source).toHaveTextContent('第二出典との照合は一部のみ（未確認）')
    const link = within(c).getByRole('link', { name: /Lahman Baseball Database \(SABR\)/ })
    expect(link).toHaveAttribute('href', 'https://example.com/lahman')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(c).getByRole('status')).toHaveTextContent('プリセット「Test Alpha」を読み込みました。')
  })

  test('https でない出典の URL はリンクにしない。照合済みのものには「未確認」を出さない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Verified')

    const c = card('Test Verified')
    expect(within(c).getByText(/出典：/)).toHaveTextContent('出典：Test Source（取得日 2026-01-02）')
    expect(within(c).queryByRole('link', { name: /Test Source/ })).not.toBeInTheDocument()
    expect(within(c).queryByText(/未確認/)).not.toBeInTheDocument()
  })

  test('同じ選手を別の打者に読み込むと、表示名に「 (2)」を付ける', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    await loadPlayer(user, '打者B', 'Test Team A', 'Test Alpha')

    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('Test Alpha')
    expect(screen.getByLabelText('打者Bの表示名')).toHaveValue('Test Alpha (2)')
    expect(screen.queryByText(/表示名がほかの打者と重複しています/)).not.toBeInTheDocument()
  })

  test('入力済みのカードには、上書きの前にカードの中で確認する。やめると変わらない', async () => {
    const user = userEvent.setup()
    render(<App />)
    fireEvent.change(input('打者A', 'PA'), { target: { value: '123' } })
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')

    const c = card('打者A')
    expect(within(c).getByText('打者A には入力済みの成績があります。プリセット「Test Alpha」の成績と名前で上書きしますか？')).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: '上書きする' })).toHaveFocus()

    await user.click(within(c).getByRole('button', { name: 'やめる' }))
    expect(input('打者A', 'PA')).toHaveValue('123')
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('打者A')
    expect(openButton('打者A')).toHaveFocus() // 読み込みのボタンへ戻る

    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    await user.click(within(card('打者A')).getByRole('button', { name: '上書きする' }))
    expect(input('Test Alpha', 'PA')).toHaveValue('600')
  })

  test('編集すると「（編集済み）」を出して参考値を隠し、「プリセットの値に戻す」で元に戻る', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Verified')
    const c = () => card('Test Verified')
    expect(within(c()).getByText(/参考値（モデルの計算には使っていません）/)).toHaveTextContent(
      '参考値（モデルの計算には使っていません）：wOBA .345／wRC+ 120（2025年、Test Reference（新しいタブで開きます）、取得日 2026-01-03）',
    )
    expect(within(c()).queryByText(/編集済み/)).not.toBeInTheDocument()

    fireEvent.change(input('Test Verified', 'HR'), { target: { value: '16' } })
    expect(within(c()).getByText(/プリセット：/).closest('p')).toHaveTextContent('Test Verified（編集済み）')
    expect(within(c()).queryByText(/参考値（モデルの計算には使っていません）/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('Test Verified') // 表示名は書き換えない

    await user.click(within(c()).getByRole('button', { name: 'プリセットの値に戻す' }))
    expect(input('Test Verified', 'HR')).toHaveValue('15')
    expect(within(c()).queryByText(/編集済み/)).not.toBeInTheDocument()
    expect(within(c()).getByText(/参考値（モデルの計算には使っていません）/)).toBeInTheDocument()
  })

  test('値を手で元に戻しても、編集済みではなくなる。犠打の空欄は0と同じに扱う', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '16' } })
    expect(card('Test Alpha')).toHaveTextContent('（編集済み）')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '15' } })
    expect(card('Test Alpha')).not.toHaveTextContent('（編集済み）')
  })

  test('プリセットの打者からコピーしても、コピー先にはプリセットの情報や参考値は写らない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Verified')
    await user.selectOptions(screen.getByLabelText('打者B：他の打者からコピー'), 'Test Verified')
    await user.click(screen.getByRole('button', { name: '打者B：コピーする' }))

    expect(input('打者B', 'HR')).toHaveValue('15')
    expect(within(card('打者B')).queryByText(/プリセット：/)).not.toBeInTheDocument()
    expect(within(card('打者B')).queryByText(/参考値/)).not.toBeInTheDocument()
  })

  test('読み込んだ選手の名前が、打順の欄の表示名になる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    expect(screen.getByRole('region', { name: '2打順' })).toHaveTextContent('Test Alpha')
  })
})

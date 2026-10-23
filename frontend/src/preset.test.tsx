import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Preset, PresetTeams, StatKey } from './api/types'
import App from './App'
import { showTab } from './test/tabs'
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
    summary: { PA: 600, HR: 15, AVG: 0.278, OBP: 0.336, SLG: 0.426, OPS: 0.762, SB: 10, CS: 3, SB_pct: 0.769 },
    reference_metrics: null,
    team_info: { code: 'XAA', name: 'Test Team A', league: 'AL', division: 'E' },
    ...overrides,
  }
}

const ALPHA = preset('alpha_2025', 'Test Alpha')
const BETA = preset('beta_2025', 'Test Beta', { stats: { ...STATS_A, HR: 30, H: 160 } })
const MOVED = preset('moved_2025', 'Test Moved', {
  team_info: { code: 'XBB', name: 'Test Team B', league: 'NL', division: 'W' },
  teams_played: [
    { code: 'XAA', name: 'Test Team A' },
    { code: 'XBB', name: 'Test Team B' },
  ],
})
const VERIFIED = preset('verified_2025', 'Test Verified', {
  verified: true,
  source: { provider: 'Test Source', url: 'http://example.com/not-https', retrieved_at: '2026-01-02' },
  team_info: { code: 'XBB', name: 'Test Team B', league: 'NL', division: 'W' },
  reference_metrics: {
    wOBA: 0.345,
    wRC_plus: 120,
    season: 2025,
    source: { provider: 'Test Reference', url: 'https://example.com/reference' },
    retrieved_at: '2026-01-03',
  },
})

// API は、リーグの中を地区 (東・中・西) の順、地区の中を球団名の順に並べて返す
const TEAMS: PresetTeams = {
  season: 2025,
  leagues: [
    {
      league: 'AL',
      teams: [
        { code: 'XAA', name: 'Test Team A', league: 'AL', division: 'E', count: 2 },
        { code: 'XAC', name: 'Test Team C', league: 'AL', division: 'C', count: 0 },
        { code: 'XAW', name: 'Test Team W', league: 'AL', division: 'W', count: 0 },
      ],
    },
    { league: 'NL', teams: [{ code: 'XBB', name: 'Test Team B', league: 'NL', division: 'W', count: 2 }] },
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
const teamButton = (team: string) =>
  within(dialog()).findByRole('button', { name: new RegExp(`^${team} \\([A-Z]+\\)\\d+人$`) })

async function openAndChooseTeam(user: ReturnType<typeof userEvent.setup>, cardName: string, team: string) {
  await user.click(openButton(cardName))
  await user.click(await teamButton(team))
}

const loadButton = (player: string, cardName: string) =>
  within(dialog()).findByRole('button', { name: new RegExp(`^${player}（.*を${cardName}に読み込む$`) })

async function loadPlayer(user: ReturnType<typeof userEvent.setup>, cardName: string, team: string, player: string) {
  await openAndChooseTeam(user, cardName, team)
  await user.click(await loadButton(player, cardName))
}

describe('プリセットの選択ダイアログ', () => {
  test('シーズン（新しい年が既定）と、リーグ → 地区（東・中・西）ごとの球団・選手数を表示する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))

    const d = dialog()
    expect(within(d).getByText('読み込み先：打者A')).toBeInTheDocument()
    await waitFor(() => expect(within(d).getByLabelText('シーズン')).toHaveValue('2025'))
    const al = await within(d).findByRole('region', { name: 'アメリカン・リーグ' })
    expect(within(al).getAllByRole('heading', { level: 5 }).map((h) => h.textContent)).toEqual([
      '東地区',
      '中地区',
      '西地区',
    ])
    expect(within(al).getByRole('button', { name: 'Test Team A (XAA)2人' })).toBeInTheDocument()
    const nl = within(d).getByRole('region', { name: 'ナショナル・リーグ' })
    expect(within(nl).getAllByRole('heading', { level: 5 }).map((h) => h.textContent)).toEqual(['西地区'])
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/presets/teams?league=mlb&season=2025')
  })

  test('球団を選ぶと、そのボタンの直後に選手の一覧を出し、ボタンは aria-expanded で開いたことを伝える', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAndChooseTeam(user, '打者A', 'Test Team A')

    const d = dialog()
    const button = await teamButton('Test Team A')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const panel = await within(d).findByRole('region', { name: 'Test Team A (XAA) の選手' })
    expect(button).toHaveAttribute('aria-controls', panel.id)
    // HTML の上で、選手の一覧は選んだ球団のボタンの直後 (同じ li の中) にある
    expect(button.nextElementSibling).toBe(panel)
    expect(await teamButton('Test Team C')).toHaveAttribute('aria-expanded', 'false')
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/presets?league=mlb&season=2025&team=XAA')
  })

  test('選手の一覧は API の値を表示する（率は .xxx の形。OPS も API の値）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAndChooseTeam(user, '打者A', 'Test Team A')

    const panel = await within(dialog()).findByRole('region', { name: 'Test Team A (XAA) の選手' })
    expect(
      await within(panel).findAllByText(/打率 \.278 ／ 出塁率 \.336 ／ 長打率 \.426 ／\s*OPS \.762 ／ 本塁打 15 ／ 打席 600/),
    ).toHaveLength(2)
  })

  test('【B1 の回帰】球団を選んだあと、Tab キーの次は選手の「読み込む」ボタン（ほかの球団のボタンを通らない）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAndChooseTeam(user, '打者A', 'Test Team A')
    const first = await loadButton('Test Alpha', '打者A')
    expect(await teamButton('Test Team A')).toHaveFocus()

    await user.tab()
    expect(first).toHaveFocus()
    await user.tab()
    expect(await loadButton('Test Beta', '打者A')).toHaveFocus()
    await user.tab()
    expect(await teamButton('Test Team C')).toHaveFocus() // 選手のあとに、次の球団へ進む
  })

  test('【B2 の回帰】球団を選んだあとも、Esc キーでダイアログが閉じる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openAndChooseTeam(user, '打者A', 'Test Team A')
    await loadButton('Test Alpha', '打者A')

    fireEvent.keyDown(await teamButton('Test Team A'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(input('打者A', 'PA')).toHaveValue('')
  })

  test('キーボードだけで、球団 → 選手と選んで読み込める', async () => {
    const user = userEvent.setup()
    render(<App />)
    openButton('打者A').focus()
    await user.keyboard('{Enter}')

    ;(await teamButton('Test Team A')).focus()
    await user.keyboard('{Enter}')
    await loadButton('Test Alpha', '打者A')
    await user.tab()
    await user.keyboard('{Enter}')

    expect(input('Test Alpha', 'PA')).toHaveValue('600')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('名前で検索でき、結果は検索欄の直後に出る。上限で切られたときは総数と一緒に知らせる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))
    const d = dialog()
    await user.type(within(d).getByLabelText('選手名で検索（すべての球団）'), 'test')
    await user.click(within(d).getByRole('button', { name: '検索' }))

    const results = await within(d).findByRole('region', { name: '「test」の検索結果' })
    expect(
      await within(results).findByText('57人のうち、名前順で最初の1人を表示しています。名前をもう少し詳しく入力してください。'),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/presets?league=mlb&season=2025&q=test')
  })

  test('移籍した選手には「年間合計（複数球団）」と、在籍した球団を球団コードで示す', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(openButton('打者A'))
    const d = dialog()
    await user.type(within(d).getByLabelText('選手名で検索（すべての球団）'), 'moved')
    await user.keyboard('{Enter}')

    const button = await within(d).findByRole('button', { name: 'Test Moved（Test Team B (XBB)）を打者Aに読み込む' })
    // 読み込むボタンの説明に含めて、読み上げでも伝わるようにする
    expect(button).toHaveAccessibleDescription(/年間合計（複数球団）／在籍した球団：XAA → XBB/)

    await user.click(button)
    expect(within(card('Test Moved')).getByText('年間合計（複数球団）／在籍した球団：XAA → XBB')).toBeInTheDocument()
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

describe('上書きの確認（ダイアログの中）', () => {
  async function chooseForFilledCard(user: ReturnType<typeof userEvent.setup>) {
    fireEvent.change(input('打者A', 'PA'), { target: { value: '123' } })
    await openAndChooseTeam(user, '打者A', 'Test Team A')
    await user.click(await loadButton('Test Alpha', '打者A'))
    return screen.getByRole('alertdialog', { name: '打者Aの入力を上書きします。よろしいですか？' })
  }

  test('入力済みのカードに読み込もうとすると、確認を出してフォーカスを移す', async () => {
    const user = userEvent.setup()
    render(<App />)
    const confirm = await chooseForFilledCard(user)
    expect(within(confirm).getByRole('button', { name: '上書きする' })).toHaveFocus()
    expect(within(confirm).getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
    // カードの中には確認を出さない (コピーの確認とは別)
    expect(within(card('打者A')).queryByRole('button', { name: '上書きする' })).not.toBeInTheDocument()
  })

  test('Esc キーは確認だけを閉じ、プリセットのダイアログは閉じない。フォーカスは選んだ選手に戻る', async () => {
    const user = userEvent.setup()
    render(<App />)
    const confirm = await chooseForFilledCard(user)

    fireEvent.keyDown(within(confirm).getByRole('button', { name: '上書きする' }), { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
    await waitFor(async () => expect(await loadButton('Test Alpha', '打者A')).toHaveFocus())
    expect(input('打者A', 'PA')).toHaveValue('123')
  })

  test('「キャンセル」で何も変えず、選手の選択に戻る', async () => {
    const user = userEvent.setup()
    render(<App />)
    const confirm = await chooseForFilledCard(user)
    await user.click(within(confirm).getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
    await waitFor(async () => expect(await loadButton('Test Alpha', '打者A')).toHaveFocus())
    expect(input('打者A', 'PA')).toHaveValue('123')
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('打者A')
  })

  test('「上書きする」で読み込み、ダイアログを閉じる', async () => {
    const user = userEvent.setup()
    render(<App />)
    const confirm = await chooseForFilledCard(user)
    await user.click(within(confirm).getByRole('button', { name: '上書きする' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(input('Test Alpha', 'PA')).toHaveValue('600')
  })

  test('空のカードには、確認を出さずに読み込む', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(input('Test Alpha', 'PA')).toHaveValue('600')
  })
})

describe('カードへの読み込み', () => {
  test('成績14項目と名前が入り、プリセットの情報をカードの上に表示する（出典はカードに出さない）', async () => {
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
    // 成績の出典はカードごとには出さず、ページの一番下の「データの出典」欄にまとめる
    expect(within(c).queryByText(/出典/)).not.toBeInTheDocument()
    expect(within(c).queryByText(/照合は一部のみ/)).not.toBeInTheDocument()
    expect(within(c).queryByRole('link')).not.toBeInTheDocument()
    expect(within(c).getByRole('status')).toHaveTextContent('プリセット「Test Alpha」を読み込みました。')
  })

  test('「データの出典」欄は、プリセットを読み込む前からページの一番下に常にある', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const sources = screen.getByRole('region', { name: 'データの出典' })
    expect(container.lastElementChild).toContainElement(sources)
    expect(within(sources).getByText(/第二出典との照合は一部のみ（未確認）/)).toBeInTheDocument()

    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    expect(screen.getAllByRole('region', { name: 'データの出典' })).toHaveLength(1)
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

  test('値を手で元に戻しても、編集済みではなくなる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '16' } })
    expect(card('Test Alpha')).toHaveTextContent('（編集済み）')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '15' } })
    expect(card('Test Alpha')).not.toHaveTextContent('（編集済み）')
  })

  test('プリセットの打者からコピーしても、コピー先にはプリセットの情報・出典・参考値は写らない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Verified')
    await user.selectOptions(screen.getByLabelText('打者B：他の打者からコピー'), 'Test Verified')
    await user.click(screen.getByRole('button', { name: '打者B：コピーする' }))

    expect(input('打者B', 'HR')).toHaveValue('15')
    expect(within(card('打者B')).queryByText(/プリセット：/)).not.toBeInTheDocument()
    expect(within(card('打者B')).queryByText(/出典：/)).not.toBeInTheDocument()
    expect(within(card('打者B')).queryByText(/参考値/)).not.toBeInTheDocument()
  })

  test('読み込んだ選手の名前が、打順の欄の表示名になる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    showTab('打順')
    expect(screen.getByRole('region', { name: '2打順' })).toHaveTextContent('Test Alpha')
  })
})

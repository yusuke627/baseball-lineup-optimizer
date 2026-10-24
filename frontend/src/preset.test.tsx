import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Preset, PresetTeams, StatKey } from './api/types'
import App from './App'
import { startManualEntry } from './test/cards'
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

function stubPresetApi(
  overrides: { teams?: () => Response; metrics?: (body: { batters: Record<string, unknown> }) => Response } = {},
) {
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/api/batters/metrics' && overrides.metrics) {
      return overrides.metrics(JSON.parse(String(init?.body)))
    }
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
const openButton = (name: string) => screen.getByRole('button', { name: `${name}の選手を選ぶ` })
/** 選手データの要約のカードで「編集する」を押す (入力欄を出す) */
const editCard = (name: string) => fireEvent.click(screen.getByRole('button', { name: `${name}を編集する` }))
const dialog = () => screen.getByRole('dialog', { name: '選手を選ぶ' })
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
    // 何も読み込まず、カードは未選択のまま
    expect(within(card('打者A')).getByRole('button', { name: '打者Aを手入力する' })).toBeInTheDocument()
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

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 読み込むと、カードは要約になり、フォーカスは「編集する」へ移る
    const editButton = screen.getByRole('button', { name: 'Test Alphaを編集する' })
    expect(editButton).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(input('Test Alpha', 'PA')).toHaveValue('600')
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
    // 何も読み込まず、カードは未選択のまま。フォーカスは「選手を選ぶ」に戻る (ブラウザ標準のダイアログの動き)
    expect(within(card('打者A')).getByRole('button', { name: '打者Aを手入力する' })).toBeInTheDocument()
  })
})

describe('上書きの確認（ダイアログの中）', () => {
  async function chooseForFilledCard(user: ReturnType<typeof userEvent.setup>) {
    // 手入力のカードに値を入れてから、「選手を選ぶ」で読み込もうとする
    startManualEntry('打者A')
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
    editCard('Test Alpha')
    expect(input('Test Alpha', 'PA')).toHaveValue('600')
  })

  test('空のカードには、確認を出さずに読み込む', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    editCard('Test Alpha')
    expect(input('Test Alpha', 'PA')).toHaveValue('600')
  })

  test('編集していない選手データを「選び直す」ときは、確認を出さない（編集した値があるときだけ確認する）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    await user.click(screen.getByRole('button', { name: 'Test Alphaの選手を選び直す' }))
    await user.click(await teamButton('Test Team A'))
    await user.click(await loadButton('Test Beta', 'Test Alpha'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(card('Test Beta')).toBeInTheDocument()

    // 編集して値を変えたあとに選び直すと、確認を出す
    editCard('Test Beta')
    fireEvent.change(input('Test Beta', 'HR'), { target: { value: '16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test Betaの編集を閉じる' }))
    await user.click(screen.getByRole('button', { name: 'Test Betaの選手を選び直す' }))
    await user.click(await teamButton('Test Team A'))
    await user.click(await loadButton('Test Alpha', 'Test Beta'))
    expect(screen.getByRole('alertdialog', { name: 'Test Betaの入力を上書きします。よろしいですか？' })).toBeInTheDocument()
  })
})

describe('カードへの読み込み', () => {
  test('成績14項目と名前が入り、プリセットの情報をカードの上に表示する（出典はカードに出さない）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    // 読み込んだ通知 (「編集する」を押すと、通知は消える)
    expect(within(card('Test Alpha')).getByRole('status')).toHaveTextContent('選手データ「Test Alpha」を読み込みました。')
    editCard('Test Alpha')

    for (const [key, value] of Object.entries(STATS_A) as [StatKey, number][]) {
      expect(input('Test Alpha', key)).toHaveValue(String(value))
    }
    const c = card('Test Alpha')
    expect(within(c).getByText(/選手データ：/).closest('p')).toHaveTextContent(
      '選手データ：Test Alpha（2025年、Test Team A (XAA)）',
    )
    // 成績の出典はカードごとには出さず、ページの一番下の「データの出典」欄にまとめる
    expect(within(c).queryByText(/出典/)).not.toBeInTheDocument()
    expect(within(c).queryByText(/照合は一部のみ/)).not.toBeInTheDocument()
    expect(within(c).queryByRole('link')).not.toBeInTheDocument()
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

    // カードの見出しは表示名
    expect(card('Test Alpha')).toBeInTheDocument()
    expect(card('Test Alpha (2)')).toBeInTheDocument()
    editCard('Test Alpha')
    editCard('Test Alpha (2)')
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('Test Alpha')
    expect(screen.getByLabelText('打者Bの表示名')).toHaveValue('Test Alpha (2)')
    expect(screen.queryByText(/表示名がほかの打者と重複しています/)).not.toBeInTheDocument()
  })

  test('編集すると「（編集済み）」を出して参考値を隠し、「選手データの値に戻す」で元に戻る', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Verified')
    const c = () => card('Test Verified')
    expect(within(c()).getByText(/参考値（モデルの計算には使っていません）/)).toHaveTextContent(
      '参考値（モデルの計算には使っていません）：wOBA .345／wRC+ 120（2025年、Test Reference（新しいタブで開きます）、取得日 2026-01-03）',
    )
    expect(within(c()).queryByText(/編集済み/)).not.toBeInTheDocument()

    // 「編集する」を押しただけでは、編集済みの通知は出さない (参考値も出たまま)
    editCard('Test Verified')
    expect(within(c()).queryByText(/編集済み/)).not.toBeInTheDocument()
    expect(within(c()).getByText(/参考値（モデルの計算には使っていません）/)).toBeInTheDocument()

    fireEvent.change(input('Test Verified', 'HR'), { target: { value: '16' } })
    expect(within(c()).getByText(/選手データ：/).closest('p')).toHaveTextContent('Test Verified（編集済み）')
    expect(within(c()).queryByText(/参考値（モデルの計算には使っていません）/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('Test Verified') // 表示名は書き換えない

    await user.click(within(c()).getByRole('button', { name: '選手データの値に戻す' }))
    expect(input('Test Verified', 'HR')).toHaveValue('15')
    expect(within(c()).queryByText(/編集済み/)).not.toBeInTheDocument()
    expect(within(c()).getByText(/参考値（モデルの計算には使っていません）/)).toBeInTheDocument()
  })

  test('値を手で元に戻しても、編集済みではなくなる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    editCard('Test Alpha')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '16' } })
    expect(card('Test Alpha')).toHaveTextContent('（編集済み）')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '15' } })
    expect(card('Test Alpha')).not.toHaveTextContent('（編集済み）')
  })

  test('プリセットの打者からコピーしても、コピー先にはプリセットの情報・出典・参考値は写らない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Verified')
    // コピー元にできるのは、入力欄を出しているカード (編集中) だけ。コピー先は手入力のカード
    editCard('Test Verified')
    startManualEntry('打者B')
    await user.selectOptions(screen.getByLabelText('打者B：他の打者からコピー'), 'Test Verified')
    await user.click(screen.getByRole('button', { name: '打者B：コピーする' }))

    expect(input('打者B', 'HR')).toHaveValue('15')
    expect(within(card('打者B')).queryByText(/選手データ：/)).not.toBeInTheDocument()
    expect(within(card('打者B')).queryByText(/出典：/)).not.toBeInTheDocument()
    expect(within(card('打者B')).queryByText(/参考値/)).not.toBeInTheDocument()
  })

  test('ダイアログの見出しと名前は「選手を選ぶ」で、開くボタン（「打者Aの選手を選ぶ」）と合う。「選手データから読み込む」は画面に残っていない', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = openButton('打者A')
    expect(opener).toHaveTextContent(/^選手を選ぶ$/)
    await user.click(opener)
    const d = screen.getByRole('dialog', { name: '選手を選ぶ' })
    expect(within(d).getByRole('heading', { level: 2 })).toHaveTextContent(/^選手を選ぶ$/)
    const allText = [
      document.body.textContent ?? '',
      ...[...document.querySelectorAll('[aria-label], [title]')].map((el) => `${el.getAttribute('aria-label')} ${el.getAttribute('title')}`),
    ].join('\n')
    expect(allText).not.toMatch(/選手データから読み込む/)
  })

  test('画面とダイアログには「プリセット」という言葉を出さない（「選手データ」と呼ぶ）', async () => {
    const user = userEvent.setup()
    render(<App />)
    /** 画面の文と、読み上げに使う属性 (aria-label・title) に「プリセット」が無いか。隠れたタブのパネルも含めて調べる */
    const wordsOnScreen = () =>
      [
        document.body.textContent ?? '',
        ...[...document.querySelectorAll('[aria-label], [title]')].flatMap((el) => [
          el.getAttribute('aria-label') ?? '',
          el.getAttribute('title') ?? '',
        ]),
      ].join('\n')
    expect(wordsOnScreen()).not.toMatch(/プリセット/)

    // ダイアログを開き、球団の選手を出したところ
    await openAndChooseTeam(user, '打者A', 'Test Team B')
    await loadButton('Test Verified', '打者A')
    expect(within(dialog()).getByRole('heading', { name: '選手を選ぶ' })).toBeInTheDocument()
    expect(wordsOnScreen()).not.toMatch(/プリセット/)

    // 読み込んだあと (カードの上の情報・通知) と、編集したあと
    await user.click(await loadButton('Test Verified', '打者A'))
    expect(card('Test Verified')).toHaveTextContent('選手データ：Test Verified')
    expect(wordsOnScreen()).not.toMatch(/プリセット/)
    editCard('Test Verified')
    fireEvent.change(input('Test Verified', 'HR'), { target: { value: '16' } })
    expect(card('Test Verified')).toHaveTextContent('選手データの値とは異なります')
    expect(wordsOnScreen()).not.toMatch(/プリセット/)
  })

  test('読み込んだ選手の名前が、打順の欄の表示名になる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    showTab('打順')
    expect(screen.getByRole('region', { name: '2打順' })).toHaveTextContent('Test Alpha')
  })
})

describe('カードの状態（選手データの要約・編集・選び直し・選択を外す）', () => {
  /** 要約の指標の一覧 (画面の略号と値) */
  const summaryText = (name: string) => within(card(name)).getByRole('list', { name: '成績の要約' }).textContent

  test('読み込むと要約を出し、入力欄は出さない。指標は API（/batters/metrics）の値', async () => {
    // テスト用の指標 (選手データの summary とは違う値にして、どちらを出しているかを確かめる)
    stubPresetApi({
      metrics: (body) =>
        json({
          batters: Object.fromEntries(
            Object.keys(body.batters).map((id) => [
              id,
              { PA: 601, H: 151, HR: 16, SB: 10, CS: 3, AVG: 0.301, OBP: 0.351, SLG: 0.451, OPS: 0.802, BB_pct: 0.07, SO_pct: 0.2, warnings: [], warning_items: [] },
            ]),
          ),
        }),
    })
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team B', 'Test Moved')
    const c = card('Test Moved')
    expect(within(c).queryAllByRole('textbox')).toHaveLength(0)
    expect(c).toHaveTextContent('選手データ：Test Moved（2025年、Test Team B (XBB)）')
    expect(c).toHaveTextContent('年間合計（複数球団）／在籍した球団：XAA → XBB')
    await waitFor(() => expect(summaryText('Test Moved')).toContain('.301'))
    expect(summaryText('Test Moved')).toMatch(/AVG.*\.301.*OBP.*\.351.*SLG.*\.451.*OPS.*\.802.*HR.*16.*PA.*601/)
    // ボタンの読み上げ名には、打者の名前を入れる
    for (const name of ['Test Movedを編集する', 'Test Movedの選手を選び直す', 'Test Movedの選択を外す']) {
      expect(within(c).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  test('指標がまだ無いとき (API が使えないときなど) は、選手データの要約（GET /presets の値）を出す', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    expect(summaryText('Test Alpha')).toMatch(/AVG.*\.278.*OBP.*\.336.*SLG.*\.426.*OPS.*\.762.*HR.*15.*PA.*600/)
  })

  test('「編集する」で入力欄を出し（フォーカスは表示名の欄）、「編集を閉じる」で要約に戻る（フォーカスは「編集する」）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    await user.click(screen.getByRole('button', { name: 'Test Alphaを編集する' }))
    expect(screen.getByLabelText('打者Aの表示名')).toHaveFocus()
    expect(input('Test Alpha', 'PA')).toHaveValue('600')

    await user.click(screen.getByRole('button', { name: 'Test Alphaの編集を閉じる' }))
    expect(within(card('Test Alpha')).queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Test Alphaを編集する' })).toHaveFocus()
  })

  test('誤りがある間は「編集を閉じる」で閉じず、直すよう案内する（隠れていた未入力の誤りも出す）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    editCard('Test Alpha')
    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '' } })
    expect(screen.queryByText(/未入力の項目/)).not.toBeInTheDocument() // 触れていない欄の未入力は、まだ出さない

    const close = screen.getByRole('button', { name: 'Test Alphaの編集を閉じる' })
    expect(close).toBeEnabled() // ボタンは無効にしない
    await user.click(close)
    expect(input('Test Alpha', 'PA')).toBeInTheDocument() // 閉じていない
    expect(within(card('Test Alpha')).getByRole('status')).toHaveTextContent('誤りを直してから閉じてください。')
    expect(screen.getByText(/Test Alphaの未入力の項目：本塁打\(HR\)/)).toBeInTheDocument()

    fireEvent.change(input('Test Alpha', 'HR'), { target: { value: '15' } })
    await user.click(close)
    expect(within(card('Test Alpha')).queryAllByRole('textbox')).toHaveLength(0)
  })

  test('「選択を外す」で未選択に戻り、フォーカスは「選手を選ぶ」へ移る', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    await user.click(screen.getByRole('button', { name: 'Test Alphaの選択を外す' }))

    const c = card('打者A')
    expect(within(c).getByRole('button', { name: '打者Aを手入力する' })).toBeInTheDocument()
    expect(openButton('打者A')).toHaveFocus()
    expect(within(c).getByRole('status')).toHaveTextContent('選択を外しました。')
    expect(c).not.toHaveTextContent('選手データ：')
  })

  test('要約のカードの表示名が重複したときは、短い誤りの文と「編集する」で直せる案内を出し、計算ではそこへ移る', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    startManualEntry('打者B')
    fireEvent.change(screen.getByLabelText('打者Bの表示名'), { target: { value: 'Test Alpha' } })

    const summaryCard = screen.getAllByRole('region', { name: 'Test Alpha' })[0]
    expect(summaryCard).toHaveTextContent(
      '入力エラー：Test Alphaの表示名がほかの打者と重複しています。別の名前にしてください。「編集する」で名前を直せます。',
    )
    showTab('計算と結果')
    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))
    // 最初の誤りは要約のカード (入力欄が無い) なので、名前を直せる「編集する」ボタンへ移る
    expect(within(summaryCard).getByRole('button', { name: 'Test Alphaを編集する' })).toHaveFocus()
  })
})

describe('コピーと、カードの状態', () => {
  test('要約のカードと未選択のカードには、コピーの操作を出さない', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    expect(within(card('Test Alpha')).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(card('Test Alpha')).queryByRole('button', { name: /コピー/ })).not.toBeInTheDocument()
    expect(within(card('打者B')).queryByRole('button', { name: /コピー/ })).not.toBeInTheDocument()
  })

  test('コピー元に選べるのは、手入力・編集中のカードだけ。「ほかの打者にコピー」は要約のカードを上書きせず、未選択のカードは手入力になる', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha') // 要約のまま
    startManualEntry('打者B', '打者C')
    // コピー元の選択肢に、要約のカード (Test Alpha) は出ない
    const options = [...within(screen.getByLabelText('打者B：他の打者からコピー')).getAllByRole('option')].map((o) => o.textContent)
    expect(options).toEqual(['コピー元を選ぶ', '打者C'])

    for (const [key, value] of Object.entries(STATS_A) as [StatKey, number][]) {
      fireEvent.change(input('打者B', key), { target: { value: String(value) } })
    }
    await user.click(screen.getByRole('button', { name: '打者B：この打者の成績を、ほかの打者にコピー' }))
    // 要約のカードは変わらない (選手データのまま)
    expect(card('Test Alpha')).toHaveTextContent('選手データ：Test Alpha')
    expect(within(card('Test Alpha')).queryAllByRole('textbox')).toHaveLength(0)
    // 未選択だった打者D〜I は、手入力の状態になって値が入る
    expect(input('打者D', 'PA')).toHaveValue('600')
    expect(input('打者I', 'HR')).toHaveValue('15')
    expect(within(card('打者B')).getByRole('status')).toHaveTextContent('打者B の成績を、ほかの7人にコピーしました。')
  })
})

describe('打順の欄との関係', () => {
  test('未選択の打者は既定の名前のまま打順に並び、指標は「成績の入力が終わると、指標を表示します。」の案内のまま', async () => {
    // 読み込んだ打者の指標は返す (未選択の打者には、指標がまだ無い)
    stubPresetApi({
      metrics: (body) =>
        json({
          batters: Object.fromEntries(
            Object.keys(body.batters).map((id) => [
              id,
              { PA: 600, H: 150, HR: 15, SB: 10, CS: 3, AVG: 0.278, OBP: 0.336, SLG: 0.426, OPS: 0.762, BB_pct: 0.07, SO_pct: 0.2, warnings: [], warning_items: [] },
            ]),
          ),
        }),
    })
    const user = userEvent.setup()
    render(<App />)
    await loadPlayer(user, '打者A', 'Test Team A', 'Test Alpha')
    showTab('打順')
    const order = screen.getByRole('region', { name: '2打順' })
    expect([...order.querySelectorAll('.order-name')].map((el) => el.textContent)).toEqual([
      'Test Alpha', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I',
    ])
    await waitFor(() =>
      expect(order.querySelector('.order-status')).toHaveTextContent('成績の入力が終わると、指標を表示します。'),
    )
  })})

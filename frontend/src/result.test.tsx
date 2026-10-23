import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { BatterMetrics, LineupEvaluationResponse, StatKey } from './api/types'
import App from './App'
import { showTab } from './test/tabs'

// 画面の CSS (列の幅による切り替えの規則を確かめる)。テストは frontend/ を起点に実行する
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']
const IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']

// テスト用の API の応答。合計と損失点の値は、わざと「1試合あたり×試合数」「推奨−入力」と違う値にしてある
// (画面がフロントで掛け算・引き算をせず、API の値をそのまま出すことを確かめるため)
const RESPONSE: LineupEvaluationResponse = {
  input_order: IDS,
  input_order_runs_per_game: 4.1,
  input_order_runs_n_games: 0,
  // 推奨打順: 打者C が1番、打者A が3番に動き、ほかは変わらない
  best_order: ['b3', 'b2', 'b1', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'],
  best_order_runs_per_game: 4.2,
  best_order_runs_n_games: 0,
  inefficiency_percent: 2.38,
  runs_lost_per_game: 0.077,
  n_games: 143,
  monte_carlo: { mean: 4.0987, std: 2.9512, min: 0, max: 19, n_trials: 5000 },
  totals_by_games: [
    { n_games: 143, input_order_runs: 111.1, best_order_runs: 222.2, runs_lost: 55.5 },
    { n_games: 162, input_order_runs: 333.3, best_order_runs: 444.4, runs_lost: 66.6 },
  ],
  warnings: [],
}
let response: LineupEvaluationResponse = RESPONSE

const METRICS: BatterMetrics = {
  PA: 600, H: 150, HR: 15, SB: 10, CS: 3, AVG: 0.278, OBP: 0.336, SLG: 0.426, OPS: 0.762,
  BB_pct: 0.0667, SO_pct: 0.2, warnings: [], warning_items: [],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/batters/metrics') {
        const body = JSON.parse(String(init?.body)) as { batters: Record<string, unknown> }
        return json({
          batters: Object.fromEntries(
            Object.keys(body.batters).map((id) => [id, id === 'b3' ? { ...METRICS, OPS: null, HR: 30 } : METRICS]),
          ),
        })
      }
      if (url === '/api/lineup/evaluate') {
        return json(response)
      }
      return json({}, 404)
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  response = RESPONSE
})

/** 9人に成績を入れて計算する。rename で、既定の名前 → 新しい表示名 に変えてから計算できる */
async function calculate(rename: Record<string, string> = {}) {
  const user = userEvent.setup()
  render(<App />)
  for (const [from, to] of Object.entries(rename)) {
    fireEvent.change(screen.getByLabelText(`${from}の表示名`), { target: { value: to } })
    fireEvent.blur(screen.getByLabelText(`${from}の表示名`))
  }
  for (const name of NAMES.map((n) => rename[n] ?? n)) {
    for (const [key, value] of Object.entries(VALID) as [StatKey, number][]) {
      fireEvent.change(screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`), {
        target: { value: String(value) },
      })
    }
  }
  // 指標の読み込みを待ってから計算する (打順の欄は「打順」、計算のボタンは「計算と結果」のタブにある)
  showTab('打順')
  await within(screen.getByRole('region', { name: '2打順' })).findAllByRole('list', { name: '指標' })
  showTab('計算と結果')
  await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))
  const result = await screen.findByRole('region', { name: '結果' })
  return { user, result }
}

const column = (result: HTMLElement, title: string) => within(result).getByRole('region', { name: title })
// 表示名のフルネーム (title に入る。狭い画面の短い名前は見た目だけ)
const names = (el: HTMLElement) => [...el.querySelectorAll('.result-order-name')].map((n) => n.getAttribute('title'))

describe('結果の左右の表示', () => {
  test('入力打順と推奨打順を、入力打順を先にして並べる', async () => {
    const { result } = await calculate()
    const columns = within(result).getAllByRole('region').filter((el) => el.classList.contains('result-column'))
    expect(columns.map((el) => el.getAttribute('aria-labelledby') && el.querySelector('h4')?.textContent)).toEqual([
      '入力打順',
      '推奨打順（近似探索）',
    ])
    expect(names(column(result, '入力打順'))).toEqual(NAMES)
    expect(names(column(result, '推奨打順（近似探索）'))).toEqual([
      '打者C', '打者B', '打者A', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I',
    ])
  })

  test('期待得点は各打順の一覧の上に、API の値で出す', async () => {
    const { result } = await calculate()
    const input = column(result, '入力打順')
    const runs = input.querySelector('.result-runs') as HTMLElement
    expect(runs).toHaveTextContent('1試合あたりの期待得点4.100')
    expect(runs.compareDocumentPosition(input.querySelector('.result-order') as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(column(result, '推奨打順（近似探索）').querySelector('.result-runs')).toHaveTextContent('1試合あたりの期待得点4.200')
  })

  test('非効率% は、2つの一覧より上に出す', async () => {
    const { result } = await calculate()
    const box = result.querySelector('.inefficiency') as HTMLElement
    expect(box).toHaveTextContent('入力打順の非効率2.38%')
    const columns = result.querySelector('.result-columns') as HTMLElement
    expect(box.compareDocumentPosition(columns) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('各行は固定の構造：1行目（番号・印・表示名）と、6つの指標の格子', async () => {
    const { result } = await calculate()
    const columns = result.querySelector('.result-columns') as HTMLElement
    expect(columns.querySelectorAll(':scope > .result-column')).toHaveLength(2)
    for (const title of ['入力打順', '推奨打順（近似探索）']) {
      for (const row of column(result, title).querySelectorAll('.result-order-row')) {
        // 子は「1行目」と「指標の格子」の2つだけ。印は1行目の中に入れ、行を増やさない
        expect([...row.children].map((el) => el.className)).toEqual(['result-order-head', 'result-metrics'])
        const head = row.firstElementChild as HTMLElement
        expect(head.firstElementChild).toHaveClass('result-order-position')
        expect(head.querySelector('.result-order-name')).not.toBeNull()
        expect(row.querySelectorAll('.result-metrics > li')).toHaveLength(6)
      }
    }
    // 動いた打者の行の1行目: 番号・表示名・狭い列の札（名前のすぐ後ろ）・広い列の札・読み上げの文
    const moved = column(result, '推奨打順（近似探索）').querySelector('.result-order-head') as HTMLElement
    expect([...moved.children].map((el) => el.className)).toEqual([
      'result-order-position',
      'result-order-name',
      'result-move result-move-narrow',
      'result-move result-move-wide',
      'visually-hidden result-move-spoken',
    ])
  })

  test('行をそろえる構造（subgrid）：各列は 見出し・期待得点・9人の一覧・（入力打順だけ）シミュレーションの欄 の順で、一覧は ol > li', async () => {
    const { result } = await calculate()
    const [input, best] = [...(result.querySelector('.result-columns') as HTMLElement).children] as HTMLElement[]
    // HTML の順番は入力打順が先。CSS のグリッドで共有する12行に、この順で入る
    expect([...input.children].map((el) => el.tagName)).toEqual(['H4', 'DL', 'OL', 'DIV'])
    expect([...best.children].map((el) => el.tagName)).toEqual(['H4', 'DL', 'OL'])
    for (const col of [input, best]) {
      expect(col.tagName).toBe('SECTION')
      expect(col).toHaveAttribute('aria-labelledby', col.querySelector('h4')?.id)
      const ol = col.querySelector(':scope > ol.result-order') as HTMLElement
      expect([...ol.children].map((el) => el.tagName)).toEqual(Array(9).fill('LI'))
      expect([...ol.children].map((li) => li.querySelector('.result-order-position')?.textContent)).toEqual(
        ['1番', '2番', '3番', '4番', '5番', '6番', '7番', '8番', '9番'],
      )
    }
  })

  test('キーボードの移動順：試合数のラジオボタンの次は、入力打順の下のシミュレーションの開閉ボタン', async () => {
    const { user, result } = await calculate()
    within(result).getByRole('radio', { name: '143試合' }).focus()
    await user.tab()
    expect(within(column(result, '入力打順')).getByRole('button', { name: '参考：シミュレーション' })).toHaveFocus()
  })

  test('画面の表記は「入力打順」で、「入力した打順」とは書かない', async () => {
    const { result } = await calculate()
    expect(result.textContent).not.toMatch(/入力した打順/)
    expect(document.body.textContent).not.toMatch(/入力した打順/)
  })

  test('各行に、少なめの指標を API の値で出す（計算できない値は「—」）', async () => {
    const { result } = await calculate()
    const rows = column(result, '推奨打順（近似探索）').querySelectorAll('.result-order-row')
    const first = within(rows[0] as HTMLElement).getByRole('list', { name: '指標' })
    expect([...first.querySelectorAll('abbr')].map((a) => a.textContent)).toEqual(['AVG', 'OBP', 'SLG', 'OPS', 'HR', 'SB'])
    expect(first).toHaveTextContent('OPSOPS —')
    expect(first).toHaveTextContent('HR本塁打 30')
  })
})

describe('143試合・162試合の切替', () => {
  test('既定は143試合で、切り替えると API の totals_by_games の値に変わる', async () => {
    const { user, result } = await calculate()
    const radio143 = within(result).getByRole('radio', { name: '143試合' })
    const radio162 = within(result).getByRole('radio', { name: '162試合' })
    expect(radio143).toBeChecked()
    expect(within(result).getByRole('group', { name: '試合数' })).toHaveTextContent(
      '試合数のみの切替で、確率はMLBデータ・文献値のままです',
    )
    expect(column(result, '入力打順').querySelector('.result-runs')).toHaveTextContent('143試合の合計111.1')
    expect(column(result, '推奨打順（近似探索）').querySelector('.result-runs')).toHaveTextContent('143試合の合計222.2')

    await user.click(radio162)
    expect(radio162).toBeChecked()
    expect(column(result, '入力打順').querySelector('.result-runs')).toHaveTextContent('162試合の合計333.3')
    expect(column(result, '推奨打順（近似探索）').querySelector('.result-runs')).toHaveTextContent('162試合の合計444.4')
    // 1試合あたりの値は変わらない
    expect(column(result, '入力打順').querySelector('.result-runs')).toHaveTextContent('1試合あたりの期待得点4.100')
  })

  test('「NPB」「MLB」とは書かない（注記の「MLBデータ」を除く）', async () => {
    const { result } = await calculate()
    const switchText = within(result).getByRole('group', { name: '試合数' }).querySelector('.games-options')?.textContent
    expect(switchText).toBe('143試合162試合')
    expect(result.textContent).not.toMatch(/NPB/)
  })

  test('キーボード（矢印キー）で切り替えられる', async () => {
    const { user, result } = await calculate()
    within(result).getByRole('radio', { name: '143試合' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(within(result).getByRole('radio', { name: '162試合' })).toBeChecked()
    expect(column(result, '入力打順').querySelector('.result-runs')).toHaveTextContent('162試合の合計333.3')
  })
})

describe('動いた打者の表示', () => {
  test('動いた打者：広い画面用「3番→1番」と狭い画面用「元3番」は見た目だけで、読み上げは幅によらず「入力打順の3番から1番へ」', async () => {
    const { result } = await calculate()
    const rows = column(result, '推奨打順（近似探索）').querySelectorAll('.result-order-row')
    const c = rows[0] as HTMLElement // 打者C: 入力では3番、推奨では1番
    const a = rows[2] as HTMLElement // 打者A: 入力では1番、推奨では3番
    const wide = c.querySelector('.result-move-wide') as HTMLElement
    const narrow = c.querySelector('.result-move-narrow') as HTMLElement
    expect(wide).toHaveTextContent('3番→1番')
    expect(narrow).toHaveTextContent('元3番')
    expect(wide).toHaveAttribute('aria-hidden', 'true')
    expect(narrow).toHaveAttribute('aria-hidden', 'true')
    // 読み上げの文は1つだけ (幅で切り替える印のどちらにも入れない)
    expect(c.querySelectorAll('.result-move-spoken')).toHaveLength(1)
    expect(c.querySelector('.result-move-spoken')).toHaveClass('visually-hidden')
    expect(c.querySelector('.result-move-spoken')).toHaveTextContent('入力打順の3番から1番へ')
    expect(a.querySelector('.result-move-wide')).toHaveTextContent('1番→3番')
    expect(a.querySelector('.result-move-narrow')).toHaveTextContent('元1番')
  })

  test('動かなかった打者は、見た目には何も出さず、読み上げ用に「変更なし」を残す。入力打順の側には何も出さない', async () => {
    const { result } = await calculate()
    const rows = column(result, '推奨打順（近似探索）').querySelectorAll('.result-order-row')
    for (const row of [rows[1], rows[8]]) {
      // 打者B (2番) と打者I (9番) は動かない
      expect(row.querySelectorAll('.result-move')).toHaveLength(0)
      const spoken = row.querySelector('.result-move-spoken') as HTMLElement
      expect(spoken).toHaveClass('visually-hidden')
      expect(spoken).toHaveTextContent('変更なし')
    }
    expect(column(result, '入力打順').querySelectorAll('.result-move, .result-move-spoken')).toHaveLength(0)
  })
})

// jsdom は container query を計算しないため、列の幅による切り替えは、CSS の規則の中身で確かめる (実際の見え方は Edge で実測)
const ruleBody = (selector: string, within: string = css) => {
  const start = within.indexOf(`${selector} {`)
  return start === -1 ? null : within.slice(start, within.indexOf('}', start))
}
const containerBlock = (minWidth: number) => {
  const start = css.indexOf(`@container result-row (min-width: ${minWidth}px) {`)
  return start === -1 ? null : css.slice(start, css.indexOf('\n}\n', start))
}

describe('動いた打者の札', () => {
  test('札は、枠線と薄い背景の小さな札（文字と枠で伝え、色だけに頼らない）', () => {
    const body = ruleBody('.result-move') as string
    expect(body).toMatch(/border: 1px solid var\(--color-accent\)/)
    expect(body).toMatch(/background: var\(--color-badge-bg\)/)
    // 1行目の高さを増やさないよう、上下の余白は付けない
    expect(body).toMatch(/padding: 0 4px/)
    // 札は縮めず切らない (収まらないときは名前の側を「…」で省略する)
    expect(body).toMatch(/flex: none/)
    expect(ruleBody('.result-order-name')).toMatch(/min-width: 0/)
    expect(ruleBody('.result-name-text')).toMatch(/text-overflow: ellipsis/)
  })

  test('狭い列用「元3番」と広い列用「3番→1番」は、どちらも札で、見た目だけ（aria-hidden）', async () => {
    const { result } = await calculate()
    const row = column(result, '推奨打順（近似探索）').querySelector('.result-order-row') as HTMLElement
    for (const badge of row.querySelectorAll('.result-move-narrow, .result-move-wide')) {
      expect(badge).toHaveClass('result-move')
      expect(badge).toHaveAttribute('aria-hidden', 'true')
    }
    expect(row.querySelector('.result-move-spoken')).toHaveTextContent('入力打順の3番から1番へ')
  })
})

describe('列の幅による指標の数', () => {
  test('OBP・SLG だけが省略できる指標で、残りは AVG → OPS → HR → SB の順。広い列のため6つとも HTML にある', async () => {
    const { result } = await calculate()
    for (const list of result.querySelectorAll('.result-metrics')) {
      const items = [...list.querySelectorAll('li')]
      expect(items.map((li) => li.querySelector('abbr')?.textContent)).toEqual(['AVG', 'OBP', 'SLG', 'OPS', 'HR', 'SB'])
      expect(items.filter((li) => li.classList.contains('result-metric-optional')).map((li) => li.querySelector('abbr')?.textContent)).toEqual(['OBP', 'SLG'])
      expect(items.filter((li) => !li.classList.contains('result-metric-optional')).map((li) => li.querySelector('abbr')?.textContent)).toEqual(['AVG', 'OPS', 'HR', 'SB'])
    }
  })

  test('狭い列では OBP・SLG を display: none で外し（画面と読み上げの両方）、2列×2段の格子にする', () => {
    expect(ruleBody('.result-metrics .result-metric-optional')).toMatch(/display: none/)
    expect(ruleBody('.result-metrics')).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  })

  test('列の幅が 200px 以上なら6つを3列×2段、344px 以上なら6列×1段にする', () => {
    const six = containerBlock(200) as string
    expect(ruleBody('.result-metrics .result-metric-optional', six)).toMatch(/display: block/)
    expect(ruleBody('.result-metrics', six)).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/)
    expect(ruleBody('.result-metrics', containerBlock(344) as string)).toMatch(/repeat\(6, max-content\)/)
  })

  test('列の幅が 255px 以上ならフルネームと「9番→1番」、それ未満は短い名前と「元9番」', () => {
    expect(ruleBody('.result-name-full')).toMatch(/display: none/)
    expect(ruleBody('.result-move-wide')).toMatch(/display: none/)
    const wide = containerBlock(255) as string
    expect(ruleBody('.result-name-full', wide)).toMatch(/display: block/)
    expect(ruleBody('.result-name-short', wide)).toMatch(/display: none/)
    expect(ruleBody('.result-move-narrow', wide)).toMatch(/display: none/)
    expect(ruleBody('.result-move-wide', wide)).toMatch(/display: inline-block/)
  })
})

describe('表示名の短縮（狭い画面）', () => {
  test('短くできる名前は、フルネーム（広い画面）と短い名前（狭い画面）を見た目だけで出し、フルネームを title と読み上げで伝える', async () => {
    const { result } = await calculate({ 打者A: 'Aaron Judge' })
    const row = column(result, '入力打順').querySelector('.result-order-row') as HTMLElement
    const name = row.querySelector('.result-order-name') as HTMLElement
    expect(name).toHaveAttribute('title', 'Aaron Judge')
    const full = name.querySelector('.result-name-full') as HTMLElement
    const short = name.querySelector('.result-name-short') as HTMLElement
    expect(full).toHaveTextContent('Aaron Judge')
    expect(short).toHaveTextContent('A. Judge')
    expect(full).toHaveAttribute('aria-hidden', 'true')
    expect(short).toHaveAttribute('aria-hidden', 'true')
    // 読み上げに残るのはフルネームの1つだけ
    const spoken = [...name.querySelectorAll('*')].filter((el) => !el.closest('[aria-hidden="true"]') && el.children.length === 0)
    expect(spoken.map((el) => el.textContent)).toEqual(['Aaron Judge'])
    expect(spoken[0]).toHaveClass('visually-hidden')
    // 推奨打順の側も同じ (打者A は推奨では3番)
    const best = column(result, '推奨打順（近似探索）').querySelectorAll('.result-order-name')[2]
    expect(best).toHaveAttribute('title', 'Aaron Judge')
    expect(best.querySelector('.result-name-short')).toHaveTextContent('A. Judge')
  })

  test('短くしない名前（1語の「打者B」など）は、そのまま1つだけ出して読み上げる', async () => {
    const { result } = await calculate()
    const name = column(result, '入力打順').querySelectorAll('.result-order-name')[1] as HTMLElement
    expect(name).toHaveAttribute('title', '打者B')
    expect(name.querySelectorAll('[aria-hidden="true"], .visually-hidden')).toHaveLength(0)
    expect(name).toHaveTextContent(/^打者B$/)
  })
})

describe('損失点', () => {
  test('非効率% の欄に、API の損失点（1試合あたりと、選んだ試合数）を出し、試合数の切替に連動する', async () => {
    const { user, result } = await calculate()
    const loss = result.querySelector('.inefficiency .inefficiency-loss') as HTMLElement
    expect(loss).toHaveTextContent('入力打順だと、推奨打順より、1試合あたり 0.077 点・143試合で 55.5 点少なくなります。')
    await user.click(within(result).getByRole('radio', { name: '162試合' }))
    expect(loss).toHaveTextContent('入力打順だと、推奨打順より、1試合あたり 0.077 点・162試合で 66.6 点少なくなります。')
  })

  test('損失点が 0 なら、期待得点が同じだと出す', async () => {
    response = {
      ...RESPONSE,
      best_order: IDS,
      inefficiency_percent: 0,
      runs_lost_per_game: 0,
      totals_by_games: RESPONSE.totals_by_games.map((t) => ({ ...t, runs_lost: 0 })),
    }
    const { result } = await calculate()
    expect(result.querySelector('.inefficiency-loss')).toHaveTextContent('入力打順と推奨打順の期待得点は同じです。')
  })
})

describe('参考：シミュレーション', () => {
  test('入力打順の欄の下にあり、初期は閉じていて、開くと API の平均・標準偏差・試行回数だけを出す', async () => {
    const { user, result } = await calculate()
    const input = column(result, '入力打順')
    const toggle = within(input).getByRole('button', { name: '参考：シミュレーション' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const body = document.getElementById(toggle.getAttribute('aria-controls') as string) as HTMLElement
    expect(body).not.toBeVisible()
    // 一覧より後ろに置く
    expect((input.querySelector('.result-order') as Node).compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(body).toBeVisible()
    expect(body).toHaveTextContent('5000試合の1試合あたりの得点：平均 4.099、標準偏差 2.951')
    expect(body).toHaveTextContent('入力打順だけの値です')
    expect(body).toHaveTextContent(
      '乱数を使うため、計算のたびに少し変わります。上の期待得点（厳密な計算）とほぼ一致するかを確かめる参考値です。',
    )
    // 最小・最大は出さない
    expect(body).not.toHaveTextContent(/最小|最大|19/)

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(body).not.toBeVisible()
  })

  test('キーボード（Enter・Space）で開閉でき、推奨打順の側には欄がない', async () => {
    const { user, result } = await calculate()
    const toggle = within(column(result, '入力打順')).getByRole('button', { name: '参考：シミュレーション' })
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(column(result, '推奨打順（近似探索）')).queryByRole('button', { name: '参考：シミュレーション' })).toBeNull()
  })

  test('API が monte_carlo を返さなければ、欄を出さない', async () => {
    response = { ...RESPONSE, monte_carlo: null }
    const { result } = await calculate()
    expect(within(result).queryByRole('button', { name: '参考：シミュレーション' })).toBeNull()
  })
})

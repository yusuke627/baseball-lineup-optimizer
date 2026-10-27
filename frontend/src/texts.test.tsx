// 段階9B: 画面の文章の整理 (残した文が見え、「説明」のボタンへ移した文は閉じているあいだ見えず、開くと原文のまま見える)
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { BatterMetrics, LineupEvaluationResponse, Preset, StatKey } from './api/types'
import { renderAppInManualEntry } from './test/cards'
import PresetInfo from './components/PresetInfo'
import { showTab } from './test/tabs'
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']
const IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']

// API の注意の文 (backend/app/schemas/batter.py の stats_warning_items と同じ形)
const LOW_PA_C =
  '打者C: 打席数(PA)=150 は少なめです（目安：200未満）。成績の標本が小さいため、確率の見積もりが実力からずれやすく、打順の結果も変わりやすくなります。計算はそのまま行います。'
const MISMATCH_E_FIRST = '打者E: 打席数(PA)=610 が、打数+四球+死球+犠飛+犠打の合計=600 と一致しません。'
const MISMATCH_E_REST = '入力値はそのまま使い、イベント確率は合計が1になるよう正規化して計算します。'

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
  monte_carlo: null,
  totals_by_games: [
    { n_games: 143, input_order_runs: 111.1, best_order_runs: 222.2, runs_lost: 55.5 },
    { n_games: 162, input_order_runs: 333.3, best_order_runs: 444.4, runs_lost: 66.6 },
  ],
  // 計算の API は、LOW_PA と PA_SUM_MISMATCH の両方の文を warnings に入れて返す
  warnings: [LOW_PA_C, MISMATCH_E_FIRST + MISMATCH_E_REST],
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
        return json({
          batters: Object.fromEntries(
            Object.keys(body.batters).map((id) => [
              id,
              id === 'b3' ? { ...METRICS, warnings: [LOW_PA_C], warning_items: [{ code: 'LOW_PA', message: LOW_PA_C }] } : METRICS,
            ]),
          ),
        })
      }
      return json(RESPONSE)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function fillAll() {
  for (const name of NAMES) {
    for (const [key, value] of Object.entries(VALID) as [StatKey, number][]) {
      fireEvent.change(screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`), { target: { value: String(value) } })
    }
  }
}

/** 説明のボタンを開いて、中身の要素を返す。開く前は中身が見えないことも確かめる */
async function openDisclosure(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, name: string) {
  const button = within(container).getByRole('button', { name })
  const body = document.getElementById(button.getAttribute('aria-controls') as string) as HTMLElement
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(body).not.toBeVisible()
  await user.click(button)
  expect(body).toBeVisible()
  return body
}

describe('ページ上部と、成績の入力・打順の案内', () => {
  test('ページ上部の文は「打順の期待得点を比べます。」', () => {
    renderAppInManualEntry()
    expect(document.querySelector('.page-header p')).toHaveTextContent(/^打順の期待得点を比べます。$/)
  })

  test('成績の入力：「選手の成績を入力してください。」を表示し、残りは「入力のしかたの説明」の中（先頭に、回数で入力することの1文）', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    const section = screen.getByRole('region', { name: '1成績の入力' })
    expect(within(section).getByText('選手の成績を入力してください。')).toBeVisible()
    const body = await openDisclosure(user, section, '入力のしかたの説明')
    expect([...body.querySelectorAll('p')].map((p) => p.textContent?.trim())).toEqual([
      '成績は、率ではなく回数（カウント）で入力します。',
      '犠打だけは空欄にできます（0として扱います）。打者の表示名は変えられます（40文字まで）。MLB の選手の成績は「選手を選ぶ」で入れられます。入力した成績は、ほかの打者にコピーできます。選手データを選んだ打者には、コピーされません。',
    ])
  })

  test('打順：「選んだ選手を、打順に並べ替えてください。」を表示し、もとの文は「並べ替えのしかたの説明」の中', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    showTab('打順')
    const section = screen.getByRole('region', { name: '2打順' })
    expect(within(section).getByText('選んだ選手を、打順に並べ替えてください。')).toBeVisible()
    const body = await openDisclosure(user, section, '並べ替えのしかたの説明')
    expect(body).toHaveTextContent(
      /^上から1番〜9番の順で計算します。取っ手（⋮⋮）のドラッグ、「上へ」「下へ」、移動先の番号で並べ替えられます。各打者の指標はサーバーが計算した値です。$/,
    )
  })

  test('入力欄の注意（打席数と内訳の不一致）は、最初の1文を表示し、残りは「（打者名）の注意の説明」の中', async () => {
    const user = userEvent.setup()
    renderAppInManualEntry()
    for (const [key, value] of Object.entries({ ...VALID, PA: 610 }) as [StatKey, number][]) {
      fireEvent.change(screen.getByLabelText(`打者A ${STAT_LABELS[key]}(${key})`), { target: { value: String(value) } })
    }
    const card = screen.getByRole('region', { name: '打者A' })
    const warning = card.querySelector('.message-warning') as HTMLElement
    expect(warning).toHaveTextContent('注意：打者Aの打席数(PA)が、打数・四球・死球・犠飛・犠打の合計と一致しません。')
    const body = await openDisclosure(user, card, '打者Aの注意の説明')
    expect(body).toHaveTextContent(/^このままでも計算できますが、入力に誤りがないか確認してください。$/)
  })
})

describe('計算と結果', () => {
  async function calculate() {
    // 操作の間に待ち時間を入れない (delay: null)。操作の内容と順番は同じ
    const user = userEvent.setup({ delay: null })
    renderAppInManualEntry()
    fillAll()
    showTab('打順')
    await within(screen.getByRole('region', { name: '2打順' })).findAllByRole('list', { name: '指標' })
    showTab('計算と結果')
    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))
    const result = await screen.findByRole('region', { name: '結果' })
    return { user, result }
  }

  test('試合数の切替の注意は、全文を原文のまま「試合数の切替についての説明」の中へ（切替のすぐそば）', async () => {
    const { user, result } = await calculate()
    const group = within(result).getByRole('group', { name: '試合数' })
    const body = await openDisclosure(user, group, '試合数の切替についての説明')
    expect(body).toHaveTextContent(
      /^試合数のみの切替で、確率はMLBデータ・文献値のままです（合計は、サーバーが1試合あたりの期待得点に試合数を掛けた値です）。$/,
    )
  })

  test('非効率%の定義の文は、全文を原文のまま「非効率%の説明」の中へ（非効率%の欄の下）。損失点の文は表示のまま', async () => {
    const { user, result } = await calculate()
    const box = result.querySelector('.inefficiency') as HTMLElement
    expect(box).toHaveTextContent('入力打順だと、推奨打順より、1試合あたり 0.100 点・143試合で 55.5 点少なくなります。')
    expect(box).not.toHaveTextContent('少ない割合です')
    const button = within(result).getByRole('button', { name: '非効率%の説明' })
    expect(box.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const body = await openDisclosure(user, result, '非効率%の説明')
    expect(body).toHaveTextContent(/^推奨打順の1試合あたりの期待得点に対して、入力打順の期待得点が少ない割合です。$/)
  })

  test('計算時の注意：見出しは「計算時の注意」。同じタブの「打席数が少ない打者」と同じ文は重ねて出さない。文は最初の1文と説明に分ける', async () => {
    const { user, result } = await calculate()
    const banner = within(result).getByText('計算時の注意').closest('.banner') as HTMLElement
    expect(banner).not.toHaveTextContent('サーバーからのメッセージ')
    // LOW_PA の文は「打席数が少ない打者」に出ているので、ここには出さない
    expect(banner).not.toHaveTextContent('少なめです')
    expect(screen.getByRole('region', { name: '打席数が少ない打者（1人）' })).toHaveTextContent('少なめです')
    // PA_SUM_MISMATCH の文は、ここにだけ出る
    expect(banner).toHaveTextContent(MISMATCH_E_FIRST)
    const body = await openDisclosure(user, banner, '打者Eの注意の説明')
    expect(body).toHaveTextContent(MISMATCH_E_REST)
  })

  test('近似探索の注意：短い1文を表示し、元の文は1文字も変えずに「推奨打順の探索についての説明」の中（表示する文の直後、結果の行の外）', async () => {
    const { user, result } = await calculate()
    const shown = within(result).getByText('推奨打順は近似探索で求めたもので、最も期待得点が高いとは限りません。')
    expect(shown).toBeVisible()
    const button = within(result).getByRole('button', { name: '推奨打順の探索についての説明' })
    // 表示する文の直後に置き、結果の左右の打順の欄の中には置かない
    expect(shown.nextElementSibling).toContainElement(button)
    expect(button.closest('.result-columns')).toBeNull()
    const body = await openDisclosure(user, result, '推奨打順の探索についての説明')
    expect(body).toHaveTextContent(
      /^推奨打順は、期待得点が高くなる打順を近似探索で求めたものです。最も期待得点が高い打順とは限らず、実行のたびに変わることがあります。$/,
    )
  })

  test('計算中は「計算中です（数秒かかります）。」。キャンセルの補足は「キャンセルについての説明」の中', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )
    const user = userEvent.setup()
    renderAppInManualEntry()
    fillAll()
    showTab('計算と結果')
    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))
    expect(screen.getByText('計算中です（数秒かかります）。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    const banner = (await screen.findByText('キャンセル：')).closest('.banner') as HTMLElement
    expect(banner).toHaveTextContent('キャンセル：計算をキャンセルしました。結果は表示しません。')
    const body = await openDisclosure(user, banner, 'キャンセルについての説明')
    expect(body).toHaveTextContent(/^（サーバー側で始まった計算は、最後まで実行されることがあります）$/)
  })

  test('古い結果を消した通知は「成績・表示名・打順が変わったため、…」から始まる', async () => {
    await calculate()
    fireEvent.change(screen.getByLabelText(`打者A ${STAT_LABELS.HR}(HR)`), { target: { value: '16' } })
    expect(document.querySelector('.result-cleared')).toHaveTextContent(
      /^成績・表示名・打順が変わったため、前の計算結果は消しました。もう一度「期待得点を計算する」を押してください。$/,
    )
  })
})

describe('選手データの情報（カードの上）', () => {
  test('成績を編集したときの文は「成績を編集したため、選手データの値とは異なります。」（参考値の補足は出さない）', () => {
    const preset = {
      id: 'test_dummy_2025',
      name: 'Test Dummy',
      season: 2025,
      league: 'MLB',
      verified: false,
      source: { provider: 'テスト用', url: 'https://example.com/', retrieved_at: '2026-01-01' },
      stats: VALID,
      reference_metrics: {
        wOBA: 0.345, season: 2025, source: { provider: 'テスト用の出典', url: 'https://example.com/r' }, retrieved_at: '2026-01-02',
      },
    } as unknown as Preset
    render(<PresetInfo preset={preset} edited disabled={false} onRevert={() => {}} />)
    expect(screen.getByText(/成績を編集したため/)).toHaveTextContent(/^成績を編集したため、選手データの値とは異なります。$/)
    expect(document.body).not.toHaveTextContent('参考値は表示していません')
  })
})

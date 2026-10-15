import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { STAT_KEYS, type StatKey } from './api/types'
import App from './App'
import { STAT_LABELS } from './validation'

const VALID: Record<StatKey, number> = {
  PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10,
  SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3,
}
const NAMES = ['打者A', '打者B', '打者C', '打者D', '打者E', '打者F', '打者G', '打者H', '打者I']

function input(name: string, key: StatKey): HTMLInputElement {
  return screen.getByLabelText(`${name} ${STAT_LABELS[key]}(${key})`)
}

function fillSlot(name: string, stats: Partial<Record<StatKey, number>> = VALID) {
  for (const [key, value] of Object.entries(stats) as [StatKey, number][]) {
    fireEvent.change(input(name, key), { target: { value: String(value) } })
  }
}

/** その打者の14項目の入力欄の内容 */
function values(name: string): Record<StatKey, string> {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, input(name, key).value])) as Record<StatKey, string>
}

const asText = (stats: Partial<Record<StatKey, number>>) =>
  Object.fromEntries(STAT_KEYS.map((key) => [key, stats[key] === undefined ? '' : String(stats[key])]))

const card = (name: string) => screen.getByRole('region', { name })
const sourceSelect = (name: string) => screen.getByLabelText(`${name}：他の打者からコピー`)
const copyButton = (name: string) => screen.getByRole('button', { name: `${name}：コピーする` })
const toAllButton = (name: string) =>
  screen.getByRole('button', { name: `${name}：この打者の成績を、ほかの全員にコピー` })
const notice = (name: string) => within(card(name)).getByRole('status')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('他の打者からコピー', () => {
  test('コピー元の成績が、このカードに入る。表示名は変わらない', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者A')

    await user.selectOptions(sourceSelect('打者B'), '打者A')
    await user.click(copyButton('打者B'))

    expect(values('打者B')).toEqual(asText(VALID))
    expect(values('打者A')).toEqual(asText(VALID)) // コピー元は変わらない
    expect(screen.getByLabelText('打者Bの表示名')).toHaveValue('打者B')
    expect(screen.getByLabelText('打者Aの表示名')).toHaveValue('打者A')
    expect(values('打者C')).toEqual(asText({})) // ほかの打者は変わらない
    // コピー先が空なので、確認は出ない
    expect(screen.queryByRole('button', { name: '上書きする' })).not.toBeInTheDocument()
    expect(notice('打者B')).toHaveTextContent('打者A の成績を 打者B にコピーしました。')
  })

  test('コピー元には、自分以外の8人を表示名で出す', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('打者Aの表示名'), { target: { value: 'Aaron Judge' } })

    const options = within(sourceSelect('打者B')).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['コピー元を選ぶ', 'Aaron Judge', ...NAMES.slice(2)])
  })

  test('コピー元を選ばずに押すと、何も変えずに知らせる', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者B', { PA: 100 })

    await user.click(copyButton('打者B'))

    expect(values('打者B')).toEqual(asText({ PA: 100 }))
    expect(notice('打者B')).toHaveTextContent('コピー元の打者を選んでください。')
  })

  test('コピー先に入力済みの欄があると、上書きの前にカードの中で確認する', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    render(<App />)
    fillSlot('打者A')
    fillSlot('打者B', { PA: 100 }) // 1項目だけでも入力済みとして扱う

    await user.selectOptions(sourceSelect('打者B'), '打者A')
    await user.click(copyButton('打者B'))

    // まだ上書きしていない
    expect(values('打者B')).toEqual(asText({ PA: 100 }))
    expect(within(card('打者B')).getByText(/打者B には入力済みの成績があります。打者A の成績で上書きしますか？/)).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled() // ブラウザの標準ダイアログは使わない
    // 確認のボタンにフォーカスが移り、確認の文が関連づけられている
    const confirm = within(card('打者B')).getByRole('button', { name: '上書きする' })
    expect(confirm).toHaveFocus()
    expect(confirm).toHaveAccessibleDescription(/上書きしますか？/)

    await user.click(confirm)

    expect(values('打者B')).toEqual(asText(VALID))
    expect(notice('打者B')).toHaveTextContent('打者A の成績を 打者B にコピーしました。')
    expect(sourceSelect('打者B')).toHaveFocus() // 元の操作に戻る
  })

  test('確認で「やめる」を選ぶと、コピー先は変わらない', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者A')
    fillSlot('打者B', { PA: 100, AB: 90 })

    await user.selectOptions(sourceSelect('打者B'), '打者A')
    await user.click(copyButton('打者B'))
    await user.click(within(card('打者B')).getByRole('button', { name: 'やめる' }))

    expect(values('打者B')).toEqual(asText({ PA: 100, AB: 90 }))
    expect(screen.queryByRole('button', { name: '上書きする' })).not.toBeInTheDocument()
    expect(notice('打者B')).toHaveTextContent('コピーをやめました。成績は変えていません。')
  })

  test('一部が未入力の打者をコピー元にすると、空欄は空欄としてコピーする', async () => {
    const user = userEvent.setup()
    render(<App />)
    const partial = { PA: 600, AB: 540, H: 150 }
    fillSlot('打者A', partial)
    fillSlot('打者B') // 全項目が入力済み

    await user.selectOptions(sourceSelect('打者B'), '打者A')
    await user.click(copyButton('打者B'))
    await user.click(within(card('打者B')).getByRole('button', { name: '上書きする' }))

    // コピー元で空欄の項目は、コピー先でも空欄になる (前の値は残らない)
    expect(values('打者B')).toEqual(asText(partial))
    // コピーしただけでは、触っていない欄の未入力エラーは出さない
    expect(within(card('打者B')).queryByText(/未入力の項目/)).not.toBeInTheDocument()
  })

  test('キーボードだけで操作できる', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者A')
    fillSlot('打者B', { PA: 100 })

    sourceSelect('打者B').focus()
    await user.selectOptions(sourceSelect('打者B'), '打者A')
    await user.tab()
    expect(copyButton('打者B')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(within(card('打者B')).getByRole('button', { name: '上書きする' })).toHaveFocus()
    await user.tab()
    expect(within(card('打者B')).getByRole('button', { name: 'やめる' })).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}{Enter}')

    expect(values('打者B')).toEqual(asText(VALID))
  })
})

describe('この打者の成績を、ほかの全員にコピー', () => {
  test('ほかの8人に同じ成績が入る。表示名は変わらない', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者C')

    await user.click(toAllButton('打者C'))

    for (const name of NAMES) {
      expect(values(name)).toEqual(asText(VALID))
    }
    expect(NAMES.map((name) => (screen.getByLabelText(`${name}の表示名`) as HTMLInputElement).value)).toEqual(NAMES)
    expect(notice('打者C')).toHaveTextContent('打者C の成績を、ほかの8人にコピーしました。')
  })

  test('入力済みの打者がいると、その打者の名前を挙げて確認する。やめると誰も変わらない', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者C')
    fillSlot('打者A', { PA: 100 })
    fillSlot('打者G', { HR: 7 })

    await user.click(toAllButton('打者C'))

    expect(
      within(card('打者C')).getByText(
        '入力済みの成績がある打者が2人います（打者A、打者G）。打者C の成績で上書きしますか？',
      ),
    ).toBeInTheDocument()
    expect(values('打者B')).toEqual(asText({})) // 確認が終わるまで、空の打者にもコピーしない

    await user.click(within(card('打者C')).getByRole('button', { name: 'やめる' }))

    expect(values('打者A')).toEqual(asText({ PA: 100 }))
    expect(values('打者G')).toEqual(asText({ HR: 7 }))
    expect(values('打者B')).toEqual(asText({}))
    expect(toAllButton('打者C')).toHaveFocus()
  })

  test('確認で「上書きする」を選ぶと、全員に入る', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者C')
    fillSlot('打者A', { PA: 100 })

    await user.click(toAllButton('打者C'))
    await user.click(within(card('打者C')).getByRole('button', { name: '上書きする' }))

    for (const name of NAMES) {
      expect(values(name)).toEqual(asText(VALID))
    }
  })
})

describe('コピーと、ほかの操作との関係', () => {
  test('コピーした成績で、そのまま計算を実行できる', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者A')
    await user.click(toAllButton('打者A'))

    await user.click(screen.getByRole('button', { name: '期待得点を計算する' }))

    const call = (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([url]) => url === '/api/lineup/evaluate')
    const body = JSON.parse(String(call?.[1].body))
    expect(Object.keys(body.batters)).toHaveLength(9)
    expect(body.batters.b9).toEqual(VALID)
  })

  test('入力を変えると、コピーの通知と確認は消える', async () => {
    const user = userEvent.setup()
    render(<App />)
    fillSlot('打者A')
    await user.selectOptions(sourceSelect('打者B'), '打者A')
    await user.click(copyButton('打者B'))
    expect(notice('打者B')).not.toBeEmptyDOMElement()

    fireEvent.change(input('打者B', 'HR'), { target: { value: '16' } })

    expect(notice('打者B')).toBeEmptyDOMElement()
  })
})

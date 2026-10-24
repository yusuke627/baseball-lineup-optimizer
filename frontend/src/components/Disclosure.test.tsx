import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import Disclosure from './Disclosure'

function setup() {
  render(
    <Disclosure name="入力のしかたの説明">
      <p>テスト用の説明の文。</p>
    </Disclosure>,
  )
  const button = screen.getByRole('button', { name: '入力のしかたの説明' })
  const body = document.getElementById(button.getAttribute('aria-controls') as string) as HTMLElement
  return { button, body }
}

describe('「説明」のボタン（Disclosure）', () => {
  test('初期は閉じていて、中身は見えない。aria-expanded と aria-controls で中身を示す', () => {
    const { button, body } = setup()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(body).not.toBeVisible()
    expect(body).toHaveTextContent('テスト用の説明の文。')
  })

  test('見える文言は「説明」と ▸（開くと ▾）。▸▾ は読み上げない。読み上げ用の名前は場所ごとの名前', async () => {
    const user = userEvent.setup()
    const { button } = setup()
    expect(button).toHaveTextContent('▸ 説明')
    expect(button.querySelector('[aria-hidden="true"]')).toHaveTextContent('▸')
    expect(button).toHaveAccessibleName('入力のしかたの説明')
    await user.click(button)
    expect(button).toHaveTextContent('▾ 説明')
  })

  test('押すと開き、もう一度押すと閉じる', async () => {
    const user = userEvent.setup()
    const { button, body } = setup()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(body).toBeVisible()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(body).not.toBeVisible()
  })

  test('キーボード（Tab で移り、Enter・Space）で開閉できる', async () => {
    const user = userEvent.setup()
    const { button } = setup()
    await user.tab()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  test('中身はボタンの直後に置く（読む順番がずれないように）', () => {
    const { button, body } = setup()
    expect(button.nextElementSibling).toBe(body)
  })

  test('label を渡すと、見える文言を変えられる（シミュレーションの欄）', () => {
    render(
      <Disclosure label="参考：シミュレーション">
        <p>中身</p>
      </Disclosure>,
    )
    expect(screen.getByRole('button', { name: '参考：シミュレーション' })).toHaveTextContent('▸ 参考：シミュレーション')
  })
})

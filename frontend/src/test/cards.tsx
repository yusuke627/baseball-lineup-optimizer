import { fireEvent, render, screen } from '@testing-library/react'

import App from '../App'

/**
 * 成績の入力のカードで「手入力する」を押す (入力欄を出す)。名前 (既定の表示名) を省くと、未選択の全員。
 * カードは初期は未選択で、入力欄が無いため、入力欄を使うテストは先にこれを呼ぶ
 */
export function startManualEntry(...names: string[]) {
  const buttons =
    names.length > 0
      ? names.map((name) => screen.getByRole('button', { name: `${name}を手入力する` }))
      : screen.getAllByRole('button', { name: /を手入力する$/ })
  for (const button of buttons) {
    fireEvent.click(button)
  }
}

/** アプリを描画し、9人とも「手入力する」を押した状態にする (これまでの、入力欄が並んだ状態と同じ) */
export function renderAppInManualEntry() {
  const result = render(<App />)
  startManualEntry()
  return result
}

/** 打者のカードの「選手を選ぶ」ボタン (未選択・手入力のカードにある) */
export function selectPlayerButton(name: string) {
  return screen.getByRole('button', { name: `${name}の選手を選ぶ` })
}

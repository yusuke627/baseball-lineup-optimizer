import { fireEvent, screen } from '@testing-library/react'

/** 手順のタブ。選んでいないタブのパネルは hidden なので、getByRole などで探す前に、そのタブを選ぶ */
export type StepTabName = '成績の入力' | '打順' | '計算と結果'

export function showTab(name: StepTabName) {
  fireEvent.click(screen.getByRole('tab', { name }))
}

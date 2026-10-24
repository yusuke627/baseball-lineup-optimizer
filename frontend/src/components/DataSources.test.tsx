import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

// 画面に書いた出典が、プリセットのファイルの source と食い違わないことを確かめる
import judge from '../../../data/presets/mlb/2025/aaron_judge_2025.json'
import arraez from '../../../data/presets/mlb/2025/luis_arraez_2025.json'
import DataSources, { LAHMAN_SOURCE, VERIFIED_SOURCES } from './DataSources'

describe('データの出典の欄', () => {
  test('照合済みの2人の出典は、プリセットのファイルの source と同じ', () => {
    for (const [file, shown] of [
      [judge, VERIFIED_SOURCES[0]],
      [arraez, VERIFIED_SOURCES[1]],
    ] as const) {
      expect(shown.player).toBe(file.name)
      expect(shown.season).toBe(file.season)
      expect(shown.provider).toBe(file.source.provider)
      expect(shown.url).toBe(file.source.url)
      expect(shown.retrievedAt).toBe(file.source.retrieved_at)
      expect(file.verified).toBe(true)
    }
  })

  test('Lahman / SABR とライセンス名、照合に使ったサイトと取得日は、常に表示する', () => {
    render(<DataSources />)
    const region = screen.getByRole('region', { name: 'データの出典' })
    expect(within(region).getByRole('heading', { level: 2, name: 'データの出典' })).toBeInTheDocument()
    // 見えている一覧 (説明のボタンの中は閉じていて見えない)
    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('選手データの打撃成績：Lahman Baseball Database (SABR)（新しいタブで開きます） / CC BY-SA 3.0')
    expect(items[1]).toHaveTextContent(
      '一部の選手の打撃成績は、Baseball Savant / Baseball-Reference で確認した値です（取得日 2026-09-29）。',
    )
    // 2人の名前は、普段は見えない
    expect(region.querySelector('.data-sources')).not.toHaveTextContent('Aaron Judge')
  })

  test('詳しい内容（照合済みの2人・確認の内容・年・改変の説明）は、もとの文のまま「出典の説明」の中にある', async () => {
    const user = userEvent.setup()
    render(<DataSources />)
    const region = screen.getByRole('region', { name: 'データの出典' })
    const toggle = within(region).getByRole('button', { name: '出典の説明' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const body = document.getElementById(toggle.getAttribute('aria-controls') as string) as HTMLElement
    const items = within(body).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent(
      '選手データの打撃成績（照合済みの2人を除く）：Lahman Baseball Database (SABR)（新しいタブで開きます） / CC BY-SA 3.0。同じシーズンに複数の球団に在籍した選手は成績を合計し、打席数は AB+BB+HBP+SF+SH で計算しています。 第二出典との照合は一部のみ（未確認）。',
    )
    expect(items[1]).toHaveTextContent(
      'Aaron Judge（2025年）の打撃成績：Baseball Savant / Baseball-Reference (相互に数値が一致することを確認済み)（新しいタブで開きます）（取得日 2026-09-29）',
    )
    expect(items[2]).toHaveTextContent(
      'Luis Arraez（2025年）の打撃成績：Baseball Savant / Baseball-Reference (相互に数値が一致することを確認済み)（新しいタブで開きます）（取得日 2026-09-29）',
    )
  })

  test('リンクは https で、新しいタブで開き、rel="noopener noreferrer" を付ける', () => {
    render(<DataSources />)
    // 説明のボタンの中 (閉じている) のリンクも含めて調べる
    const links = within(screen.getByRole('region', { name: 'データの出典' })).getAllByRole('link', { hidden: true })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      LAHMAN_SOURCE.url,
      LAHMAN_SOURCE.url,
      VERIFIED_SOURCES[0].url,
      VERIFIED_SOURCES[1].url,
    ])
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveTextContent('（新しいタブで開きます）')
    }
  })
})

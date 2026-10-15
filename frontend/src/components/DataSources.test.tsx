import { render, screen, within } from '@testing-library/react'
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

  test('見出しとリストで、Lahman と照合済みの2人の出典を示す', () => {
    render(<DataSources />)
    const region = screen.getByRole('region', { name: 'データの出典' })
    expect(within(region).getByRole('heading', { level: 2, name: 'データの出典' })).toBeInTheDocument()
    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Lahman Baseball Database (SABR)（新しいタブで開きます） / CC BY-SA 3.0')
    expect(items[0]).toHaveTextContent('第二出典との照合は一部のみ（未確認）')
    expect(items[1]).toHaveTextContent('Aaron Judge（2025年）の打撃成績：Baseball Savant / Baseball-Reference')
    expect(items[2]).toHaveTextContent('Luis Arraez（2025年）の打撃成績：Baseball Savant / Baseball-Reference')
  })

  test('リンクは https で、新しいタブで開き、rel="noopener noreferrer" を付ける', () => {
    render(<DataSources />)
    const links = within(screen.getByRole('region', { name: 'データの出典' })).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
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

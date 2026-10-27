import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

// 見た目の案の切り替え (data-design 属性・?design=・開発用の切り替えボタン) は、案Bに決めて削除した (段階9C の仕上げ)。
// 起動 (main.tsx) で、どの URL でも html に data-design を付けず、切り替えのボタンも出さないことを確かめる
describe('見た目は1つだけ（案の切り替えは無い）', () => {
  let container: HTMLElement | undefined

  afterEach(() => {
    container?.remove()
    container = undefined
    window.history.replaceState(null, '', '/')
    vi.unstubAllGlobals()
  })

  async function start(search: string) {
    container = document.createElement('div')
    container.id = 'root'
    document.body.append(container)
    window.history.replaceState(null, '', `/${search}`)
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    vi.resetModules()
    await act(async () => {
      await import('./main')
    })
  }

  test('?design=a・?design=b を指定しても、html に data-design を付けず、切り替えのボタンも出さない', async () => {
    for (const search of ['', '?design=a', '?design=b']) {
      document.documentElement.removeAttribute('data-design')
      await start(search)
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(document.documentElement).not.toHaveAttribute('data-design')
      expect(document.querySelector('[data-design]')).toBeNull()
      expect(screen.queryByRole('button', { name: /デザイン/ })).not.toBeInTheDocument()
      container?.remove()
    }
  })

  test('CSS に案ごとの規則（data-design）は無い', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).not.toMatch(/data-design/)
    expect(css).not.toMatch(/design-switcher/)
  })
})

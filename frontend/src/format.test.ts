import { describe, expect, test } from 'vitest'

import { formatRate, safeHttpsUrl, teamLabel } from './format'

describe('率の表示', () => {
  test('1未満は先頭の0を省いて小数3桁にする (桁をそろえるだけで、値は変えない)', () => {
    expect(formatRate(0.331)).toBe('.331')
    expect(formatRate(0.3)).toBe('.300')
    expect(formatRate(0)).toBe('.000')
    expect(formatRate(1)).toBe('1.000')
    expect(formatRate(1.2345)).toBe('1.234')
  })

  test('計算できない値 (null) は「—」', () => {
    expect(formatRate(null)).toBe('—')
    expect(formatRate(undefined)).toBe('—')
  })
})

test('球団は「球団名 (コード)」の形', () => {
  expect(teamLabel({ code: 'NYY', name: 'New York Yankees' })).toBe('New York Yankees (NYY)')
})

describe('リンクにしてよい URL', () => {
  test.each(['https://sabr.org/lahman-database/', 'https://example.com/a?b=c'])('https は許可: %s', (url) => {
    expect(safeHttpsUrl(url)).toBe(url)
  })

  test.each([
    'http://example.com/',
    'javascript:alert(1)',
    'ftp://example.com/',
    ' https://example.com/',
    'HTTPS://example.com/',
    'not a url',
    '',
  ])('https で始まらないものは null: %s', (url) => {
    expect(safeHttpsUrl(url)).toBeNull()
  })

  test('URL が無ければ null', () => {
    expect(safeHttpsUrl(undefined)).toBeNull()
  })
})

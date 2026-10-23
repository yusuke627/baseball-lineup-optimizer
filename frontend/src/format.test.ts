import { describe, expect, test } from 'vitest'

import { formatRate, safeHttpsUrl, shortDisplayName, teamLabel } from './format'

describe('狭い画面の短い表示名', () => {
  test.each([
    ['Aaron Judge', 'A. Judge'],
    ['Ronald Acuña Jr.', 'R. Acuña Jr.'], // 接尾辞つき
    ['Ken Griffey II', 'K. Griffey II'],
    ['Max Muncy (2)', 'M. Muncy (2)'], // 重複番号つき
    ['Isiah Kiner-Falefa', 'I. Kiner-Falefa'], // ハイフンつきの姓
    ['Michael A. Taylor', 'M. A. Taylor'], // ピリオド付きのミドルイニシャル
    ['Ángel Martínez', 'Á. Martínez'], // 最初の単語がアクセントつき
    ['Jean-Pierre Smith', 'J. Smith'], // ハイフンつきの名
    ['  Aaron   Judge  ', 'A. Judge'], // 前後と途中の空白
    // 接尾辞つき (data/overrides/display_names.json で足した表記の例)
    ['Fernando Tatis Jr.', 'F. Tatis Jr.'],
    ['Michael Harris II', 'M. Harris II'],
    ['Robert Hassell III', 'R. Hassell III'],
    ['Vladimir Guerrero Jr.', 'V. Guerrero Jr.'],
    ['Ronald Acuña Jr.', 'R. Acuña Jr.'],
  ])('%s → %s', (name, expected) => {
    expect(shortDisplayName(name)).toBe(expected)
  })

  test.each([
    ['打者A', '1語'],
    ['Ohtani', '1語の英字'],
    ['大谷 翔平', '日本語'],
    ['打者A (2)', '日本語で重複番号つき'],
    ['Judge (2)', '1語に重複番号だけ'],
    ['J.D. Martinez', '最初の単語が既にイニシャル'],
    ['Tatis Jr.', '残りが接尾辞だけ'],
    ['Harris II', '残りが接尾辞だけ（II）'],
    ['Hassell III', '残りが接尾辞だけ（III）'],
    ['Smith Sr.', '残りが接尾辞だけ（Sr.）'],
    ['Smith IV', '残りが接尾辞だけ（IV）'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN', '空白なしの長い名前'],
  ])('%s（%s）は、そのまま', (name) => {
    expect(shortDisplayName(name)).toBe(name)
  })

  test('そのまま返すときも前後の空白は除く', () => {
    expect(shortDisplayName('  打者A ')).toBe('打者A')
  })
})

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

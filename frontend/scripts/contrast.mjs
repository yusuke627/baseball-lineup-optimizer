// 配色のコントラスト比を計算して確認する。`npm run contrast` で実行する。
// 色は src/index.css の :root の変数 (--color-*) から読むので、CSS を変えたらそのまま再計算できる。
// 計算式は WCAG 2.x の相対輝度とコントラスト比。基準は、文字が 4.5:1 以上、
// 入力欄の枠線・フォーカスの枠などの部品が 3:1 以上。1つでも下回れば終了コード1で終わる。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CSS_PATH = fileURLToPath(new URL('../src/index.css', import.meta.url))

const TEXT = 4.5
const COMPONENT = 3

// [前景の変数, 背景の変数, 基準, 使っている場所]
const PAIRS = [
  ['text', 'bg', TEXT, '本文（ページの地）'],
  ['text', 'surface', TEXT, '本文・入力欄の文字（カード、入力欄）'],
  ['muted', 'bg', TEXT, '補足の文字（ページの地）'],
  ['muted', 'surface', TEXT, '補足の文字・項目名（カード）'],
  ['on-accent', 'accent', TEXT, 'ボタン・ステップ番号の文字'],
  ['on-disabled', 'disabled', TEXT, '押せないボタンの文字'],
  ['accent', 'surface', TEXT, '主でないボタン（コピーなど）の文字'],
  ['accent', 'bg', TEXT, 'リンクの文字（プリセット欄の地）'],
  ['text', 'bg', TEXT, 'プリセット欄の文字'],
  ['muted', 'bg', TEXT, 'プリセット欄の補足の文字'],
  ['warning', 'surface', COMPONENT, '上書きの確認の枠線'],  ['error', 'surface', TEXT, 'エラーの文字（カード）'],
  ['error', 'error-bg', TEXT, 'エラーの文字（エラーの地）'],
  ['warning', 'warning-bg', TEXT, '注意の文字（注意の地）'],
  ['border', 'surface', COMPONENT, '入力欄の枠線'],
  ['error', 'surface', COMPONENT, 'エラーのある入力欄の枠線（カード）'],
  ['accent', 'bg', COMPONENT, 'フォーカスの枠（ページの地）'],
  ['accent', 'surface', COMPONENT, 'フォーカスの枠（カード）'],
  ['accent', 'bg', COMPONENT, 'ボタンの地（ページの地との区別）'],
]

function readVariables(block) {
  const variables = {}
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    variables[match[1]] = match[2]
  }
  return variables
}

function readThemes(css) {
  const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')
  if (darkStart === -1) {
    throw new Error('ダーク用の配色 (@media (prefers-color-scheme: dark)) が見つかりません')
  }
  const darkEnd = css.indexOf('\n}\n', darkStart)
  const light = readVariables(css.slice(0, darkStart))
  const dark = { ...light, ...readVariables(css.slice(darkStart, darkEnd)) }
  return { ライト: light, ダーク: dark }
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(hexA, hexB) {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const themes = readThemes(readFileSync(CSS_PATH, 'utf8'))
let failed = 0

for (const [themeName, variables] of Object.entries(themes)) {
  console.log(`\n[${themeName}]`)
  for (const [foreground, background, required, where] of PAIRS) {
    const fg = variables[foreground]
    const bg = variables[background]
    if (fg === undefined || bg === undefined) {
      throw new Error(`変数 --color-${fg === undefined ? foreground : background} が見つかりません`)
    }
    const ratio = contrastRatio(fg, bg)
    const ok = ratio >= required
    if (!ok) {
      failed += 1
    }
    console.log(
      `${ok ? 'OK ' : 'NG '} ${ratio.toFixed(2).padStart(5)}:1 (基準 ${required}:1)  ${fg} / ${bg}  ${where}`,
    )
  }
}

if (failed > 0) {
  console.error(`\n基準を下回る組み合わせが ${failed} 件あります。`)
  process.exit(1)
}
console.log('\nすべての組み合わせが基準を満たしています。')

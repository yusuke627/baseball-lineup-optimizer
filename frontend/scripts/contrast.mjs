// 配色のコントラスト比を計算して確認する。`npm run contrast` で実行する。
// 色は src/index.css のライト・ダークの2つのパレットの変数 (--color-*) から読むので、CSS を変えたらそのまま再計算できる。
// パレットは、CSS の中の「/* @palette ライト */」「/* @palette ダーク */」の印の直後の規則 ({ から } まで) から読む。
// 計算式は WCAG 2.x の相対輝度とコントラスト比。基準は、文字が 4.5:1 以上、
// 入力欄の枠線・フォーカスの枠・ボタンの面などの部品が 3:1 以上。1つでも下回れば終了コード1で終わる。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CSS_PATH = fileURLToPath(new URL('../src/index.css', import.meta.url))

const TEXT = 4.5
const COMPONENT = 3

// [前景の変数, 背景の変数, 基準, 使っている場所]
// primary・on-primary は「選んだ状態」の面と文字 (主のボタン・選んだ選択肢・選んだタブの下線)。フォーカスの枠は accent
const PAIRS = [
  // 文字と地
  ['text', 'bg', TEXT, '本文（ページの地）'],
  ['text', 'surface', TEXT, '本文・入力欄・カードの見出し・副のボタンの文字（カード、入力欄）'],
  ['muted', 'bg', TEXT, '補足の文字・選んでいないタブ・「説明」のボタン（ページの地）'],
  ['muted', 'surface', TEXT, '補足の文字・項目名・指標の略号・単位・「打者Aに読み込みました」（カード・結果の欄・ダイアログ）'],
  ['muted', 'warning-bg', TEXT, '「説明」のボタンの文字（注意の地）'],
  ['accent', 'bg', TEXT, 'リンクの文字（ページの地・選手データの欄）'],
  ['accent', 'surface', TEXT, 'リンクの文字（カード・ダイアログ）'],
  ['accent', 'badge-bg', TEXT, '動いた打者の札の文字（札の地）'],
  // 選んだ状態・主のボタン
  ['on-primary', 'primary', TEXT, '主のボタンの文字（選手を選ぶ・編集する・計算する など）'],
  ['on-primary', 'primary', TEXT, '選んだ選択肢の文字（試合数・開いている球団）'],
  ['text', 'bg', TEXT, '選んでいるタブの文字（ページの地）'],
  ['on-disabled', 'disabled', TEXT, '押せないボタンの文字'],
  // ヘッダーの帯
  ['on-band', 'band', TEXT, 'ヘッダーのタイトル（帯）'],
  ['on-band', 'band', COMPONENT, 'タイトルの左のダイヤモンドの印（帯。装飾）'],
  // パネルの見出しの縦線は飾り (基準は必須ではないが、部品と同じ 3:1 で確かめる)
  ['accent', 'bg', COMPONENT, 'パネルの見出しの縦線（ページの地）'],
  // 注意・エラー
  ['error', 'error-bg', TEXT, 'エラーの文字（エラーの地）'],
  ['error', 'surface', TEXT, 'エラーの文字（カード）'],
  ['warning', 'warning-bg', TEXT, '注意の文字（注意の地）'],
  // 部品の境界・面 (3:1)
  ['border', 'surface', COMPONENT, '入力欄・副のボタン・選択肢の枠線（カード）'],
  ['border', 'bg', COMPONENT, '入力欄・副のボタンの枠線、タブの並びの下の線（ページの地）'],
  ['primary', 'bg', COMPONENT, '主のボタンの面（ページの地との区別）'],
  ['primary', 'surface', COMPONENT, '主のボタンの面（カードの地との区別）'],
  ['primary', 'surface', COMPONENT, '選んだ選択肢の枠線（結果の欄・ダイアログの地との区別）'],
  ['primary', 'bg', COMPONENT, '選んでいるタブの下線（ページの地との区別）'],
  ['accent', 'badge-bg', COMPONENT, '動いた打者の札の枠線（札の地との区別）'],
  ['accent', 'surface', COMPONENT, '動いた打者の札の枠線・「続けて次の打者を選ぶ」のチェック・ラジオの丸（カード・ダイアログ・結果の欄）'],
  ['error', 'surface', COMPONENT, 'エラーのある入力欄・カードの枠線（カード）'],
  ['warning', 'surface', COMPONENT, '上書きの確認の枠線（ダイアログの地）'],
  // フォーカスの枠 (3:1)
  ['accent', 'bg', COMPONENT, 'フォーカスの枠（ページの地）'],
  ['accent', 'surface', COMPONENT, 'フォーカスの枠（カード・ダイアログ・結果の欄）'],
  ['accent', 'warning-bg', COMPONENT, 'フォーカスの枠（注意の地。「説明」のボタンなど）'],
  ['accent', 'error-bg', COMPONENT, 'フォーカスの枠（エラーの地。エラーの要約の打者名のボタン）'],
]

const PALETTE_MARK = /\/\* @palette (ライト|ダーク) \*\//g

function readVariables(block) {
  const variables = {}
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    variables[match[1]] = match[2]
  }
  return variables
}

function readPalettes(css) {
  const palettes = {}
  for (const match of css.matchAll(PALETTE_MARK)) {
    const start = css.indexOf('{', match.index)
    const end = css.indexOf('}', start)
    palettes[match[1]] = readVariables(css.slice(start, end))
  }
  if (Object.keys(palettes).length !== 2) {
    throw new Error(`パレットが2つ見つかりません (見つかったもの: ${Object.keys(palettes).join('、') || 'なし'})`)
  }
  return palettes
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

const palettes = readPalettes(readFileSync(CSS_PATH, 'utf8'))
let failed = 0

for (const [paletteName, variables] of Object.entries(palettes)) {
  console.log(`\n[${paletteName}]`)
  for (const [foreground, background, required, where] of PAIRS) {
    const fg = variables[foreground]
    const bg = variables[background]
    if (fg === undefined || bg === undefined) {
      throw new Error(`${paletteName}: 変数 --color-${fg === undefined ? foreground : background} が見つかりません`)
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
console.log(`\n${PAIRS.length} の組み合わせ × ${Object.keys(palettes).length} つのパレットが、すべて基準を満たしています。`)

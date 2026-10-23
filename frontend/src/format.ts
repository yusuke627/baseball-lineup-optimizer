// 画面に出す値の書式。ここでは API が返した値の桁や表記をそろえるだけで、値の計算はしない。

import type { Division, TeamInfo, TeamPlayed } from './api/types'

/** 打率などの率を、野球で一般的な「.331」の形にする (1以上は「1.000」) */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  const text = value.toFixed(3)
  return text.startsWith('0.') ? text.slice(1) : text
}

/** 四球率などの割合 (0〜1) を「6.7%」の形にする (桁をそろえるだけで、値は変えない) */
export function formatShare(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  return `${(value * 100).toFixed(1)}%`
}

/** 名前の接尾辞 (scripts/build_lahman_presets.py の NAME_SUFFIXES と同じ) */
const NAME_SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV'])

/**
 * 狭い画面で使う、短くした表示名 (表示だけの整形で、表示名のデータは変えない)。
 * 最初の単語をイニシャルにする (例: Aaron Judge → A. Judge、Ronald Acuña Jr. → R. Acuña Jr.、Max Muncy (2) → M. Muncy (2))。
 * 短くするのは、空白で区切られた2語以上で、最初の単語がラテン文字 (アクセントつきを含む) で始まり、
 * 残りに、接尾辞 (Jr.・Sr.・II・III・IV) 以外の文字を含む単語がある名前だけ。1語の名前・日本語の名前・
 * 最初の単語が既にイニシャル (J.D. など) の名前・「Tatis Jr.」のように残りが接尾辞だけの名前は、
 * 前後の空白を除いてそのまま返す。
 */
export function shortDisplayName(name: string): string {
  const trimmed = name.trim()
  const [first, ...rest] = trimmed.split(/\s+/)
  if (
    rest.length === 0 ||
    !/^\p{Script=Latin}/u.test(first) ||
    first.endsWith('.') ||
    !rest.some((word) => /\p{L}/u.test(word) && !NAME_SUFFIXES.has(word))
  ) {
    return trimmed
  }
  return `${[...first][0]}. ${rest.join(' ')}`
}

/** 球団の表記「球団名 (コード)」(例: New York Yankees (NYY)) */
export function teamLabel(team: Pick<TeamInfo, 'name' | 'code'> | TeamPlayed): string {
  return `${team.name} (${team.code})`
}

/** リンクにしてよい URL か (https:// で始まるものだけ)。それ以外は null */
export function safeHttpsUrl(url: string | undefined): string | null {
  if (url === undefined) {
    return null
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && url.startsWith('https://') ? url : null
  } catch {
    return null
  }
}

/** 移籍した選手の在籍した球団を、球団コードで出場した順に並べる (例: TB → CWS) */
export function teamsPlayedLabel(teams: TeamPlayed[]): string {
  return `在籍した球団：${teams.map((team) => team.code).join(' → ')}`
}

export const LEAGUE_LABELS: Record<'AL' | 'NL', string> = {
  AL: 'アメリカン・リーグ',
  NL: 'ナショナル・リーグ',
}

export const DIVISION_LABELS: Record<Division, string> = {
  E: '東地区',
  C: '中地区',
  W: '西地区',
}

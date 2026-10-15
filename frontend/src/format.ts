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

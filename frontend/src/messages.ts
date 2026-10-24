// 画面に出す文の扱い (文の中身は変えず、どこまでを表示するかだけを決める)

import type { MetricsState } from './useBatterMetrics'

/**
 * 「打席数が少ない打者」の一覧 (計算と結果のタブ) に出している文。POST /batters/metrics の注意のうち、種類が LOW_PA のもの。
 * 結果の「計算時の注意」で、同じ文を重ねて出さないために使う
 */
export function lowPaMessages(entries: { id: string }[], metrics: MetricsState): string[] {
  if (metrics.status !== 'done') {
    return []
  }
  return entries.flatMap((entry) =>
    (metrics.batters[entry.id]?.warning_items ?? []).filter((item) => item.code === 'LOW_PA').map((item) => item.message),
  )
}

/**
 * 警告の文を「最初の1文」と「残り」に分ける。分け方は、最初の「。」まで (「。」を含む) を1文目とするだけ。
 * API が返す文 (LOW_PA・PA_SUM_MISMATCH など) も、フロントでは書き換えない。
 * 「。」が無いときや、1文目のあとに何も無いときは、rest を空文字にする (説明のボタンを出さない)
 */
export function splitFirstSentence(message: string): { first: string; rest: string } {
  const end = message.indexOf('。')
  if (end === -1) {
    return { first: message, rest: '' }
  }
  return { first: message.slice(0, end + 1), rest: message.slice(end + 1).trim() }
}

/** 警告の「説明」のボタンの読み上げ用の名前。同じ打者に注意が複数あるときは「（2件目）」などを付けて重ならないようにする */
export function warningButtonName(batterName: string, index: number, count: number): string {
  return count > 1 ? `${batterName}の注意の説明（${index + 1}件目）` : `${batterName}の注意の説明`
}

import { describe, expect, test } from 'vitest'

import { splitFirstSentence, warningButtonName } from './messages'

describe('警告の文の「最初の1文」', () => {
  test('API の LOW_PA の文 (backend/app/schemas/batter.py と同じ形) は、最初の「。」までと残りに分かれる', () => {
    const message =
      '打者C: 打席数(PA)=150 は少なめです（目安：200未満）。成績の標本が小さいため、確率の見積もりが実力からずれやすく、打順の結果も変わりやすくなります。計算はそのまま行います。'
    expect(splitFirstSentence(message)).toEqual({
      first: '打者C: 打席数(PA)=150 は少なめです（目安：200未満）。',
      rest: '成績の標本が小さいため、確率の見積もりが実力からずれやすく、打順の結果も変わりやすくなります。計算はそのまま行います。',
    })
  })

  test('API の PA_SUM_MISMATCH の文も同じ規則で分ける（文は書き換えない）', () => {
    const message =
      '打者E: 打席数(PA)=610 が、打数+四球+死球+犠飛+犠打の合計=600 と一致しません。入力値はそのまま使い、イベント確率は合計が1になるよう正規化して計算します。'
    const { first, rest } = splitFirstSentence(message)
    expect(first).toBe('打者E: 打席数(PA)=610 が、打数+四球+死球+犠飛+犠打の合計=600 と一致しません。')
    expect(rest).toBe('入力値はそのまま使い、イベント確率は合計が1になるよう正規化して計算します。')
    expect(first + rest).toBe(message)
  })

  test('画面の検証の文（打席数と内訳の不一致）も同じ規則で分ける', () => {
    const { first, rest } = splitFirstSentence(
      '打者Aの打席数(PA)が、打数・四球・死球・犠飛・犠打の合計と一致しません。このままでも計算できますが、入力に誤りがないか確認してください。',
    )
    expect(first).toBe('打者Aの打席数(PA)が、打数・四球・死球・犠飛・犠打の合計と一致しません。')
    expect(rest).toBe('このままでも計算できますが、入力に誤りがないか確認してください。')
  })

  test('1文だけの文や「。」の無い文は、残りが空（説明のボタンを出さない）', () => {
    expect(splitFirstSentence('打者Aの注意です。')).toEqual({ first: '打者Aの注意です。', rest: '' })
    expect(splitFirstSentence('句点の無い文')).toEqual({ first: '句点の無い文', rest: '' })
  })
})

describe('警告の「説明」のボタンの名前', () => {
  test('1件なら「（打者名）の注意の説明」、複数なら「（N件目）」を付けて重ならないようにする', () => {
    expect(warningButtonName('打者C', 0, 1)).toBe('打者Cの注意の説明')
    expect(warningButtonName('打者C', 0, 2)).toBe('打者Cの注意の説明（1件目）')
    expect(warningButtonName('打者C', 1, 2)).toBe('打者Cの注意の説明（2件目）')
  })
})

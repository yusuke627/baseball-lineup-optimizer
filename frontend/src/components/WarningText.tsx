import { splitFirstSentence } from '../messages'
import Disclosure from './Disclosure'

interface WarningTextProps {
  /** 警告の文 (API が返した文、または画面の検証の文)。書き換えずに使う */
  message: string
  /** 説明のボタンの読み上げ用の名前 (例: 「打者Cの注意の説明」) */
  name: string
}

/**
 * 警告の文の、最初の1文 (最初の「。」まで) を表示し、残りは原文のまま「説明」のボタンの中に入れる。
 * 1文だけの文には、ボタンを出さない
 */
export default function WarningText({ message, name }: WarningTextProps) {
  const { first, rest } = splitFirstSentence(message)
  return (
    <>
      {first}
      {rest !== '' && (
        <Disclosure name={name} className="warning-disclosure">
          <p>{rest}</p>
        </Disclosure>
      )}
    </>
  )
}

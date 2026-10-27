/**
 * 数値の文字列 (例: 「2.38%」) の末尾の単位「%」だけを、小さく添える span (.unit) で包む。
 * 見た目だけの整形で、文字列そのもの (textContent) は変えない。単位が無ければ、そのまま出す
 */
export default function NumberWithUnit({ text }: { text: string }) {
  if (!text.endsWith('%')) {
    return <>{text}</>
  }
  return (
    <>
      {text.slice(0, -1)}
      <span className="unit">%</span>
    </>
  )
}

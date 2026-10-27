/**
 * タイトルの左に置く、野球のダイヤモンドの印 (装飾)。回した正方形の細い線と、4つの塁 (本塁・一塁・二塁・三塁) の小さな点。
 * 色は文字の色 (currentColor) に従う。線の太さは、印の大きさによらず同じ (non-scaling-stroke)。
 * 読み上げには含めない (aria-hidden)。画像ファイルやアイコンフォントは使わない
 */
export default function DiamondMark() {
  return (
    <svg className="diamond-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3 L21 12 L12 21 L3 12 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 本塁・一塁・二塁・三塁 */}
      <circle cx="12" cy="21" r="1.8" fill="currentColor" />
      <circle cx="21" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="3" r="1.8" fill="currentColor" />
      <circle cx="3" cy="12" r="1.8" fill="currentColor" />
    </svg>
  )
}

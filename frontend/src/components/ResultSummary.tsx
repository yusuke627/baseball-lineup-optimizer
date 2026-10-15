import type { LineupEvaluationResponse } from '../api/types'

// 表示する数値はすべて API が返した値。ここでは桁をそろえるだけで、計算はしない。
function formatRuns(value: number): string {
  return value.toFixed(3)
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

interface ResultSummaryProps {
  result: LineupEvaluationResponse
  /** 打者の内部ID → 実行した時点の表示名 */
  names: Record<string, string>
}

export default function ResultSummary({ result, names }: ResultSummaryProps) {
  // API は打順を打者の内部IDで返すので、表示名に直して出す
  const orderText = (order: string[]) => order.map((id) => names[id] ?? id).join(' → ')

  return (
    <section aria-labelledby="result-heading" className="result">
      <h3 id="result-heading">結果</h3>

      {/* いちばん見せたい3つの数値を大きく出す */}
      <dl className="figures">
        <div className="figure">
          <dt>入力した打順の期待得点（1試合あたり）</dt>
          <dd className="number">{formatRuns(result.input_order_runs_per_game)}</dd>
        </div>
        <div className="figure">
          <dt>推奨打順の期待得点（1試合あたり）</dt>
          <dd className="number">{formatRuns(result.best_order_runs_per_game)}</dd>
        </div>
        <div className="figure">
          <dt>入力した打順の非効率</dt>
          <dd className="number">{formatPercent(result.inefficiency_percent)}</dd>
        </div>
      </dl>

      <dl className="orders">
        <dt>入力した打順（1番から9番）</dt>
        <dd>{orderText(result.input_order)}</dd>
        <dt>推奨打順（近似探索、1番から9番）</dt>
        <dd>{orderText(result.best_order)}</dd>
      </dl>

      {result.warnings.length > 0 && (
        <div className="banner banner-warning" role="status">
          <strong>計算時の注意（サーバーからのメッセージ）</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="note">
        推奨打順は、期待得点が高くなる打順を近似探索で求めたものです。最も期待得点が高い打順とは限らず、実行のたびに変わることがあります。
      </p>
    </section>
  )
}

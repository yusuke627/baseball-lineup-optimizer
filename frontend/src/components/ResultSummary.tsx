import type { LineupEvaluationResponse } from '../api/types'

// 表示する数値はすべて API が返した値。ここでは桁をそろえるだけで、計算はしない。
function formatRuns(value: number): string {
  return value.toFixed(3)
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export default function ResultSummary({ result }: { result: LineupEvaluationResponse }) {
  return (
    <section aria-labelledby="result-heading" className="result">
      <h2 id="result-heading">結果</h2>

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

      <table className="result-table">
        <caption>1試合あたりの期待得点</caption>
        <thead>
          <tr>
            <th scope="col">打順</th>
            <th scope="col">並び（1番から9番）</th>
            <th scope="col">1試合あたりの期待得点</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">入力した打順</th>
            <td>{result.input_order.join(' → ')}</td>
            <td className="number">{formatRuns(result.input_order_runs_per_game)}</td>
          </tr>
          <tr>
            <th scope="row">最適打順（近似探索）</th>
            <td>{result.best_order.join(' → ')}</td>
            <td className="number">{formatRuns(result.best_order_runs_per_game)}</td>
          </tr>
        </tbody>
      </table>

      <p>
        入力した打順の非効率：
        <strong className="number">{formatPercent(result.inefficiency_percent)}</strong>
      </p>
      <p className="note">
        最適打順は近似探索の結果です。厳密な最適解とは限らず、実行のたびに変わることがあります。
      </p>
    </section>
  )
}

import type { MetricsState } from '../useBatterMetrics'

interface BatterWarningsProps {
  /** 打順の順に並べた打者 (内部ID と表示名) */
  entries: { id: string; name: string }[]
  metrics: MetricsState
}

/**
 * 計算と結果の上に出す、打席数が少ない打者の一覧。
 * POST /batters/metrics の注意のうち、種類 (code) が LOW_PA のものだけを、API の文のまま出す。
 * 基準の打席数や文の判定は、フロントでは行わない (どの打者が該当するかは API が決める)。
 */
export default function BatterWarnings({ entries, metrics }: BatterWarningsProps) {
  if (metrics.status !== 'done') {
    return null
  }
  const lowPa = entries
    .map((entry) => ({
      ...entry,
      messages: (metrics.batters[entry.id]?.warning_items ?? [])
        .filter((item) => item.code === 'LOW_PA')
        .map((item) => item.message),
    }))
    .filter((entry) => entry.messages.length > 0)
  if (lowPa.length === 0) {
    return null
  }
  return (
    <section className="banner banner-warning batter-warnings" aria-labelledby="batter-warnings-heading">
      <h3 id="batter-warnings-heading">打席数が少ない打者（{lowPa.length}人）</h3>
      <ul>
        {lowPa.map((entry) => (
          <li key={entry.id}>
            {entry.messages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}

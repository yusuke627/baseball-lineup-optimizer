import { useId, type ReactNode } from 'react'

import type { BatterMetrics, LineupEvaluationResponse, MonteCarloSummary } from '../api/types'
import { formatRate, shortDisplayName } from '../format'
import { warningButtonName } from '../messages'
import type { MetricsState } from '../useBatterMetrics'
import Disclosure from './Disclosure'
import WarningText from './WarningText'

// 表示する数値はすべて API が返した値。ここでは桁をそろえるだけで、計算はしない。
function formatRuns(value: number): string {
  return value.toFixed(3)
}

function formatTotal(value: number): string {
  return value.toFixed(1)
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

/**
 * 結果の各行に出す、少なめの指標 (POST /batters/metrics の値)。label は画面の略号、spoken は読み上げの名前。
 * optional の指標 (OBP・SLG) は、列が狭いとき CSS で画面からも読み上げからも外す (残りは AVG → OPS → HR → SB の順)
 */
const RESULT_METRICS: { label: string; spoken: string; optional?: boolean; value: (m: BatterMetrics) => string }[] = [
  { label: 'AVG', spoken: '打率', value: (m) => formatRate(m.AVG) },
  { label: 'OBP', spoken: '出塁率', optional: true, value: (m) => formatRate(m.OBP) },
  { label: 'SLG', spoken: '長打率', optional: true, value: (m) => formatRate(m.SLG) },
  { label: 'OPS', spoken: 'OPS', value: (m) => formatRate(m.OPS) },
  { label: 'HR', spoken: '本塁打', value: (m) => String(m.HR) },
  { label: 'SB', spoken: '盗塁', value: (m) => String(m.SB) },
]

interface ResultSummaryProps {
  result: LineupEvaluationResponse
  /** 打者の内部ID → 実行した時点の表示名 */
  names: Record<string, string>
  /** 打者ごとの指標 (計算した時点の入力のもの。入力を変えると結果は消える) */
  metrics: MetricsState
  /** 選んでいる試合数 (totals_by_games の n_games のどれか) */
  games: number
  onGamesChange: (games: number) => void
  /** 同じタブにすでに出ている注意の文 (「打席数が少ない打者」の一覧)。「計算時の注意」には重ねて出さない */
  shownWarnings: string[]
}

/**
 * 計算の結果。入力打順と推奨打順を、画面の幅にかかわらず左右に並べる (HTML の順番でも入力打順が先)。
 * 期待得点・試合数ごとの合計・非効率%・損失点は API の値をそのまま出す (フロントでは掛け算・引き算などの計算をしない)。
 */
export default function ResultSummary({ result, names, metrics, games, onGamesChange, shownWarnings }: ResultSummaryProps) {
  const gamesName = useId()
  const total = result.totals_by_games.find((entry) => entry.n_games === games)
  const metricsById = metrics.status === 'done' ? metrics.batters : {}
  // 同じタブの「打席数が少ない打者」に、すでに同じ文が出ていれば、ここでは重ねて出さない
  const warnings = result.warnings.filter((warning) => !shownWarnings.includes(warning))
  // API の注意の文は「(打者名): …」で始まる。説明のボタンの名前に打者名を入れる (分からなければ番号で区別する)
  const warningName = (warning: string, index: number) => {
    const batter = Object.values(names).find((name) => warning.startsWith(`${name}: `))
    if (batter === undefined) {
      return `計算時の注意の説明（${index + 1}件目）`
    }
    const sameBatter = warnings.filter((other) => other.startsWith(`${batter}: `))
    return warningButtonName(batter, sameBatter.indexOf(warning), sameBatter.length)
  }

  return (
    <section aria-labelledby="result-heading" className="result">
      <h3 id="result-heading">結果</h3>

      <fieldset className="games-switch">
        <legend>試合数</legend>
        <div className="games-options">
          {result.totals_by_games.map((entry) => (
            <label key={entry.n_games}>
              <input
                type="radio"
                name={gamesName}
                value={entry.n_games}
                checked={entry.n_games === games}
                onChange={() => onGamesChange(entry.n_games)}
              />
              {entry.n_games}試合
            </label>
          ))}
        </div>
        <Disclosure name="試合数の切替についての説明">
          <p className="note">試合数のみの切替で、確率はMLBデータ・文献値のままです（合計は、サーバーが1試合あたりの期待得点に試合数を掛けた値です）。</p>
        </Disclosure>
      </fieldset>

      {/* 非効率% と損失点は、2つの打順の期待得点の近く (一覧より上) に目立たせて出す */}
      <div className="inefficiency">
        <p className="inefficiency-label">入力打順の非効率</p>
        <p className="inefficiency-value number">{formatPercent(result.inefficiency_percent)}</p>
        <p className="inefficiency-loss">
          {result.runs_lost_per_game === 0 ? (
            '入力打順と推奨打順の期待得点は同じです。'
          ) : (
            <>
              入力打順だと、推奨打順より、1試合あたり <strong className="number">{formatRuns(result.runs_lost_per_game)}</strong> 点・
              {games}試合で <strong className="number">{total === undefined ? '—' : formatTotal(total.runs_lost)}</strong>{' '}
              点少なくなります。
            </>
          )}
        </p>
      </div>
      <Disclosure name="非効率%の説明" className="inefficiency-disclosure">
        <p className="note">推奨打順の1試合あたりの期待得点に対して、入力打順の期待得点が少ない割合です。</p>
      </Disclosure>

      <div className="result-columns">
        <OrderColumn
          title="入力打順"
          order={result.input_order}
          perGame={result.input_order_runs_per_game}
          total={total?.input_order_runs}
          games={games}
          names={names}
          metricsById={metricsById}
        >
          {result.monte_carlo && <SimulationPanel summary={result.monte_carlo} />}
        </OrderColumn>
        <OrderColumn
          title="推奨打順（近似探索）"
          order={result.best_order}
          perGame={result.best_order_runs_per_game}
          total={total?.best_order_runs}
          games={games}
          names={names}
          metricsById={metricsById}
          compareWith={result.input_order}
        />
      </div>

      {warnings.length > 0 && (
        <div className="banner banner-warning" role="status">
          <strong>計算時の注意</strong>
          <ul>
            {warnings.map((warning, index) => (
              <li key={warning}>
                {/* API の文の最初の1文を表示し、残りは「説明」のボタンの中へ (文は書き換えない) */}
                <WarningText message={warning} name={warningName(warning, index)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="note">推奨打順は近似探索で求めたもので、最も期待得点が高いとは限りません。</p>
      {/* 元の文は、1文字も変えずにボタンの中へ (結果の行の外、表示する文の直後) */}
      <Disclosure name="推奨打順の探索についての説明">
        <p className="note">
          推奨打順は、期待得点が高くなる打順を近似探索で求めたものです。最も期待得点が高い打順とは限らず、実行のたびに変わることがあります。
        </p>
      </Disclosure>
    </section>
  )
}

interface OrderColumnProps {
  title: string
  /** 打者の内部ID の並び (1番から9番) */
  order: string[]
  perGame: number
  /** 選んだ試合数の合計 (API の totals_by_games の値) */
  total: number | undefined
  games: number
  names: Record<string, string>
  metricsById: Record<string, BatterMetrics>
  /** 比べる打順 (入力打順)。指定すると、各打者が何番から何番へ動いたかを出す */
  compareWith?: string[]
  /** 一覧の下に置くもの (入力打順のシミュレーションの欄) */
  children?: ReactNode
}

function OrderColumn({ title, order, perGame, total, games, names, metricsById, compareWith, children }: OrderColumnProps) {
  const headingId = useId()
  return (
    <section className="result-column" aria-labelledby={headingId}>
      <h4 id={headingId}>{title}</h4>
      <dl className="result-runs">
        <div>
          <dt>1試合あたりの期待得点</dt>
          <dd className="number">{formatRuns(perGame)}</dd>
        </div>
        <div>
          <dt>{games}試合の合計</dt>
          <dd className="number">{total === undefined ? '—' : formatTotal(total)}</dd>
        </div>
      </dl>
      <ol className="result-order">
        {order.map((id, index) => {
          const metrics = metricsById[id]
          // 入力打順での番号と比べる (2つの打順の並びの位置を比べるだけで、新しい値は作らない)
          const from = compareWith ? compareWith.indexOf(id) + 1 : null
          const to = index + 1
          const moved = from !== null && from > 0 && from !== to
          return (
            <li key={id} className="result-order-row">
              {/* 1行目は番号・表示名・動いた打者の印 (1行に収める)。指標は2行目以降の固定の格子 */}
              <span className="result-order-head">
                <span className="result-order-position">{to}番</span>
                <ResultName name={names[id] ?? id} />
                {/* 狭い列の札は名前のすぐ後ろに「元9番」、広い列の札は行の右端に「9番→1番」。札は縮めず、名前の側を「…」で省略する。
                    どちらも見た目だけで、読み上げは下の1文 */}
                {moved && (
                  <span className="result-move result-move-narrow" aria-hidden="true">
                    元{from}番
                  </span>
                )}
                {moved && (
                  <span className="result-move result-move-wide" aria-hidden="true">
                    {from}番→{to}番
                  </span>
                )}
                {from !== null && from > 0 && (
                  <span className="visually-hidden result-move-spoken">
                    {moved ? `入力打順の${from}番から${to}番へ` : '変更なし'}
                  </span>
                )}
              </span>
              {metrics && (
                <ul className="result-metrics" aria-label="指標">
                  {RESULT_METRICS.map((column) => (
                    <li key={column.label} className={column.optional ? 'result-metric-optional' : undefined}>
                      <abbr title={column.spoken} aria-hidden="true">
                        {column.label}
                      </abbr>
                      <span className="visually-hidden">{column.spoken}</span> {column.value(metrics)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      {children}
    </section>
  )
}

/**
 * 結果の行の表示名。狭い列では最初の単語をイニシャルにした名前 (shortDisplayName)、広い列ではフルネームを出し、
 * 収まらなければ「…」で省略する。フルネームは title と読み上げ用の文字で伝え、見た目の名前は読み上げない。
 */
function ResultName({ name }: { name: string }) {
  const short = shortDisplayName(name)
  if (short === name.trim()) {
    return (
      <span className="result-order-name" title={name}>
        <span className="result-name-text">{name}</span>
      </span>
    )
  }
  return (
    <span className="result-order-name" title={name}>
      <span className="result-name-text result-name-full" aria-hidden="true">
        {name}
      </span>
      <span className="result-name-text result-name-short" aria-hidden="true">
        {short}
      </span>
      <span className="visually-hidden">{name}</span>
    </span>
  )
}

/** 入力打順を案B (モンテカルロ法) で評価した参考値。初期は閉じておき、平均と標準偏差だけを出す (開閉は共通の Disclosure) */
function SimulationPanel({ summary }: { summary: MonteCarloSummary }) {
  return (
    <Disclosure label="参考：シミュレーション" className="simulation">
      <p>この欄は入力打順だけの値です（推奨打順のシミュレーションは行っていません）。</p>
      <p className="simulation-value">
        {summary.n_trials}試合の1試合あたりの得点：平均 <span className="number">{formatRuns(summary.mean)}</span>、標準偏差{' '}
        <span className="number">{formatRuns(summary.std)}</span>
      </p>
      <p className="note">
        乱数を使うため、計算のたびに少し変わります。上の期待得点（厳密な計算）とほぼ一致するかを確かめる参考値です。
      </p>
    </Disclosure>
  )
}

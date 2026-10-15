import { SourceLink } from './PresetInfo'

/**
 * 照合済みのプリセット (Lahman 由来ではないもの) の出典。
 * 値は data/presets/mlb/2025/ の各ファイルの source と同じ (DataSources.test.tsx で一致を確かめている)
 */
export const VERIFIED_SOURCES = [
  {
    player: 'Aaron Judge',
    season: 2025,
    provider: 'Baseball Savant / Baseball-Reference (相互に数値が一致することを確認済み)',
    url: 'https://baseballsavant.mlb.com/savant-player/aaron-judge-592450',
    retrievedAt: '2026-09-29',
  },
  {
    player: 'Luis Arraez',
    season: 2025,
    provider: 'Baseball Savant / Baseball-Reference (相互に数値が一致することを確認済み)',
    url: 'https://baseballsavant.mlb.com/savant-player/luis-arraez-650333',
    retrievedAt: '2026-09-29',
  },
] as const

/** Lahman Baseball Database の出典 (data/NOTICE と同じ。URL は Lahman の readme に書かれた Web サイト) */
export const LAHMAN_SOURCE = {
  provider: 'Lahman Baseball Database (SABR)',
  url: 'https://sabr.org/lahman-database/',
  license: 'CC BY-SA 3.0',
} as const

/**
 * ページの一番下に常に出す「データの出典」欄。プリセットの成績の出典をまとめて示す
 * (カードごとには出さない)。参考値 (reference_metrics) の出典は、カードの参考値の横に出す。
 */
export default function DataSources() {
  return (
    <footer className="page-footer">
      <section aria-labelledby="data-sources-heading">
        <h2 id="data-sources-heading">データの出典</h2>
        <ul className="data-sources">
          <li>
            プリセットの打撃成績（照合済みの2人を除く）：
            <SourceLink url={LAHMAN_SOURCE.url}>{LAHMAN_SOURCE.provider}</SourceLink> / {LAHMAN_SOURCE.license}
            。同じシーズンに複数の球団に在籍した選手は成績を合計し、打席数は AB+BB+HBP+SF+SH で計算しています。
            第二出典との照合は一部のみ（未確認）。
          </li>
          {VERIFIED_SOURCES.map((source) => (
            <li key={source.player}>
              {source.player}（{source.season}年）の打撃成績：
              <SourceLink url={source.url}>{source.provider}</SourceLink>（取得日 {source.retrievedAt}）
            </li>
          ))}
        </ul>
      </section>
    </footer>
  )
}

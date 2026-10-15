import type { Preset } from '../api/types'
import { formatRate, safeHttpsUrl, teamLabel } from '../format'

/** Lahman Baseball Database から生成したプリセットの出典名 (data/NOTICE を参照) */
const LAHMAN_PROVIDER = 'Lahman Baseball Database (SABR)'

/** https の URL だけをリンクにする。それ以外は文字として出す */
function SourceLink({ url, children }: { url: string; children: string }) {
  const href = safeHttpsUrl(url)
  if (href === null) {
    return <>{children}</>
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden">（新しいタブで開きます）</span>
    </a>
  )
}

interface PresetInfoProps {
  slotId: string
  preset: Preset
  edited: boolean
  disabled: boolean
  onRevert: () => void
}

/** カードに出す、読み込んだプリセットの情報 (選手・球団・出典・参考値) */
export default function PresetInfo({ slotId, preset, edited, disabled, onRevert }: PresetInfoProps) {
  const team = preset.team_info ?? null
  const isLahman = preset.source.provider === LAHMAN_PROVIDER
  const reference = preset.reference_metrics
  const movedId = `preset-moved-${slotId}`

  return (
    <div className="preset-info">
      <p className="preset-info-title">
        <span className="preset-info-label">プリセット：</span>
        <strong>
          {preset.name}
          {edited && '（編集済み）'}
        </strong>
        （{preset.season}年{team && `、${teamLabel(team)}`}）
      </p>
      {preset.teams_played && preset.teams_played.length > 1 && (
        <p id={movedId} className="preset-info-moved">
          年間合計（複数球団）：在籍した球団は {preset.teams_played.map(teamLabel).join(' → ')}
        </p>
      )}
      <p className="preset-info-source">
        出典：
        {isLahman ? (
          <>
            <SourceLink url={preset.source.url}>{LAHMAN_PROVIDER}</SourceLink> / CC BY-SA 3.0
          </>
        ) : (
          <SourceLink url={preset.source.url}>{preset.source.provider}</SourceLink>
        )}
        （取得日 {preset.source.retrieved_at}）
        {preset.verified === false && <>。第二出典との照合は一部のみ（未確認）</>}
      </p>
      {edited && (
        <p className="preset-info-edited">
          成績を編集したため、プリセットの値とは異なります
          {reference && '（参考値は表示していません）'}。
        </p>
      )}
      {reference && !edited && (
        <p className="preset-info-reference">
          参考値（モデルの計算には使っていません）：
          {reference.wOBA !== undefined && <>wOBA {formatRate(reference.wOBA)}</>}
          {reference.wOBA !== undefined && reference.wRC_plus !== undefined && '／'}
          {reference.wRC_plus !== undefined && <>wRC+ {reference.wRC_plus}</>}
          （{reference.season}年、
          <SourceLink url={reference.source.url}>{reference.source.provider}</SourceLink>、取得日{' '}
          {reference.retrieved_at}）
        </p>
      )}
      {edited && (
        <button type="button" className="button-secondary" disabled={disabled} onClick={onRevert}>
          プリセットの値に戻す
        </button>
      )}
    </div>
  )
}

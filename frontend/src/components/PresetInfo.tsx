import type { Preset } from '../api/types'
import { formatRate, safeHttpsUrl, teamLabel, teamsPlayedLabel } from '../format'

/** https の URL だけをリンクにする。それ以外は文字として出す */
export function SourceLink({ url, children }: { url: string; children: string }) {
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
  preset: Preset
  edited: boolean
  disabled: boolean
  onRevert: () => void
}

/** カードの上に出す、読み込んだプリセットの情報 (選手・球団・移籍・参考値)。成績の出典はページの下の「データの出典」欄に出す */
export default function PresetInfo({ preset, edited, disabled, onRevert }: PresetInfoProps) {
  const team = preset.team_info ?? null
  const reference = preset.reference_metrics

  return (
    <div className="preset-info">
      <p className="preset-info-title">
        <span className="preset-info-label">選手データ：</span>
        <strong>
          {preset.name}
          {edited && '（編集済み）'}
        </strong>
        （{preset.season}年{team && `、${teamLabel(team)}`}）
      </p>
      {preset.teams_played && preset.teams_played.length > 1 && (
        <p className="preset-info-moved">年間合計（複数球団）／{teamsPlayedLabel(preset.teams_played)}</p>
      )}
      {edited && (
        <p className="preset-info-edited">成績を編集したため、選手データの値とは異なります。</p>
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
          選手データの値に戻す
        </button>
      )}
    </div>
  )
}


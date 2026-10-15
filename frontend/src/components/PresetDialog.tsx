import { useEffect, useId, useRef, useState } from 'react'

import { ApiError, fetchPresetSeasons, fetchPresetTeams, searchPresets } from '../api/client'
import type { Preset, PresetSearchResult, PresetTeams } from '../api/types'
import { formatRate, LEAGUE_LABELS, teamLabel } from '../format'

interface PresetDialogProps {
  open: boolean
  /** 読み込み先の打者の表示名 */
  targetName: string
  onClose: () => void
  onChoose: (preset: Preset) => void
}

type Load<T> = { status: 'idle' } | { status: 'loading' } | { status: 'done'; data: T } | { status: 'error'; message: string }

const FALLBACK_ERROR = 'プリセットを読み込めませんでした。時間をおいて、もう一度お試しください。'

function errorMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    return error.kind === 'aborted' ? null : error.message
  }
  return FALLBACK_ERROR
}

/** API から読み込み、結果を Load の形で持つ。key が変わると読み込み直す (前の読み込みは中止する) */
function useLoad<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Load<T> {
  const [state, setState] = useState<{ key: string | null; value: Load<T> }>({ key: null, value: { status: 'idle' } })
  // 読み込みの関数は描画のたびに作り直されるので、最新のものを ref に入れておく (key が変わったときだけ読み込む)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (key === null) {
      return
    }
    const controller = new AbortController()
    loadRef.current(controller.signal).then(
      (data) => setState({ key, value: { status: 'done', data } }),
      (error: unknown) => {
        const message = errorMessage(error)
        if (message !== null) {
          setState({ key, value: { status: 'error', message } })
        }
      },
    )
    return () => controller.abort()
  }, [key])

  return key === null || state.key !== key ? (key === null ? { status: 'idle' } : { status: 'loading' }) : state.value
}

/**
 * プリセットを選ぶダイアログ。シーズン → 球団 (リーグごと) → 選手 の順に選ぶ。名前での検索も使える。
 * 表示する数値はすべて API が返した値で、ここでは桁をそろえるだけ。
 */
export default function PresetDialog({ open, targetName, onClose, onChoose }: PresetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const searchId = useId()
  const seasonId = useId()
  const [season, setSeason] = useState<number | null>(null)
  const [team, setTeam] = useState<string | null>(null)
  const [queryText, setQueryText] = useState('')
  const [query, setQuery] = useState('')

  // ブラウザ標準のダイアログ (モーダル) を開閉する。Esc キーで閉じたときも onClose を呼ぶ
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) {
      return
    }
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const seasons = useLoad(open ? 'seasons' : null, (signal) => fetchPresetSeasons(signal))
  const seasonList = seasons.status === 'done' ? seasons.data.seasons : []
  // シーズンを選んでいなければ、いちばん新しいシーズンにする
  const currentSeason = season ?? (seasonList.length > 0 ? seasonList[seasonList.length - 1] : null)

  const teams = useLoad<PresetTeams>(
    open && currentSeason !== null ? `teams-${currentSeason}` : null,
    (signal) => fetchPresetTeams(currentSeason ?? 0, signal),
  )
  const searchKey =
    !open || currentSeason === null
      ? null
      : query !== ''
        ? `q-${currentSeason}-${query}`
        : team !== null
          ? `team-${currentSeason}-${team}`
          : null
  const players = useLoad<PresetSearchResult>(searchKey, (signal) =>
    searchPresets(
      query !== '' ? { season: currentSeason ?? 0, q: query } : { season: currentSeason ?? 0, team: team ?? undefined },
      signal,
    ),
  )

  const selectedTeam =
    teams.status === 'done' && team !== null
      ? teams.data.leagues.flatMap((group) => group.teams).find((t) => t.code === team) ?? null
      : null

  function handleSearch(event: { preventDefault: () => void }) {
    event.preventDefault()
    setQuery(queryText.trim())
  }

  function clearSearch() {
    setQueryText('')
    setQuery('')
  }

  function changeSeason(value: number) {
    setSeason(value)
    setTeam(null)
  }

  let listHeading = '球団を選ぶか、選手名で検索してください。'
  if (query !== '') {
    listHeading = `「${query}」の検索結果`
  } else if (selectedTeam !== null) {
    listHeading = `${teamLabel(selectedTeam)} の選手`
  }

  return (
    <dialog ref={dialogRef} className="preset-dialog" aria-labelledby={titleId} onClose={onClose}>
      <div className="preset-dialog-header">
        <div>
          <h2 id={titleId}>プリセットから読み込む</h2>
          <p className="note">読み込み先：{targetName}</p>
        </div>
        <button type="button" className="button-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>

      {seasons.status === 'error' && <p className="message-error">{seasons.message}</p>}

      <div className="preset-dialog-controls">
        <div className="field">
          <label htmlFor={seasonId}>シーズン</label>
          <select
            id={seasonId}
            value={currentSeason ?? ''}
            disabled={seasonList.length === 0}
            onChange={(event) => changeSeason(Number(event.target.value))}
          >
            {seasonList.map((value) => (
              <option key={value} value={value}>
                {value}年
              </option>
            ))}
          </select>
        </div>
        <form role="search" className="preset-search" onSubmit={handleSearch}>
          <div className="field">
            <label htmlFor={searchId}>選手名で検索（すべての球団）</label>
            <input
              id={searchId}
              type="search"
              autoComplete="off"
              maxLength={40}
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
            />
          </div>
          <button type="submit" className="button-secondary">
            検索
          </button>
          {query !== '' && (
            <button type="button" className="button-secondary" onClick={clearSearch}>
              検索をやめる
            </button>
          )}
        </form>
      </div>

      <div className="preset-dialog-body">
        <div className="preset-teams">
          <h3>球団</h3>
          {teams.status === 'loading' && <p role="status">球団の一覧を読み込んでいます…</p>}
          {teams.status === 'error' && <p className="message-error">{teams.message}</p>}
          {teams.status === 'done' &&
            teams.data.leagues.map((group) => (
              <section key={group.league} aria-label={LEAGUE_LABELS[group.league]}>
                <h4>{LEAGUE_LABELS[group.league]}</h4>
                <ul className="preset-team-list">
                  {group.teams.map((t) => (
                    <li key={t.code}>
                      <button
                        type="button"
                        className="preset-team-button"
                        aria-pressed={query === '' && team === t.code}
                        onClick={() => {
                          clearSearch()
                          setTeam(t.code)
                        }}
                      >
                        {teamLabel(t)}
                        <span className="preset-team-count">{t.count}人</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>

        <div className="preset-players">
          <h3>{listHeading}</h3>
          <p role="status" className="note">
            {players.status === 'loading' && '選手の一覧を読み込んでいます…'}
            {players.status === 'done' &&
              (players.data.items.length < players.data.total
                ? `${players.data.total}人のうち、名前順で最初の${players.data.items.length}人を表示しています。名前をもう少し詳しく入力してください。`
                : `${players.data.total}人`)}
          </p>
          {players.status === 'error' && <p className="message-error">{players.message}</p>}
          {players.status === 'done' && (
            <ul className="preset-player-list">
              {players.data.items.map((preset) => (
                <PlayerRow key={preset.id} preset={preset} targetName={targetName} onChoose={onChoose} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  )
}

function PlayerRow({
  preset,
  targetName,
  onChoose,
}: {
  preset: Preset
  targetName: string
  onChoose: (preset: Preset) => void
}) {
  const detailId = useId()
  const team = preset.team_info ? teamLabel(preset.team_info) : preset.team ?? '球団の情報なし'
  const moved = preset.teams_played && preset.teams_played.length > 1 ? preset.teams_played : null
  const { summary } = preset
  return (
    <li className="preset-player">
      <div id={detailId} className="preset-player-detail">
        <p className="preset-player-name">
          <strong>{preset.name}</strong> {team}
        </p>
        {moved && (
          <p className="preset-player-moved">
            年間合計（複数球団）：在籍した球団は {moved.map(teamLabel).join(' → ')}
          </p>
        )}
        <p className="preset-player-stats">
          打率 {formatRate(summary.AVG)} ／ 出塁率 {formatRate(summary.OBP)} ／ 長打率 {formatRate(summary.SLG)} ／
          本塁打 {summary.HR} ／ 打席 {summary.PA}
        </p>
      </div>
      <button
        type="button"
        aria-label={`${preset.name}（${team}）を${targetName}に読み込む`}
        aria-describedby={detailId}
        onClick={() => onChoose(preset)}
      >
        読み込む
      </button>
    </li>
  )
}

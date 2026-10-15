import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'

import { ApiError, fetchPresetSeasons, fetchPresetTeams, searchPresets } from '../api/client'
import type { Division, Preset, PresetSearchResult, PresetTeam, PresetTeams } from '../api/types'
import { DIVISION_LABELS, formatRate, LEAGUE_LABELS, teamLabel, teamsPlayedLabel } from '../format'

interface PresetDialogProps {
  open: boolean
  /** 読み込み先の打者の表示名 */
  targetName: string
  /** 読み込み先の打者に、入力済みの成績があるか (あれば読み込む前に上書きを確認する) */
  targetHasValues: boolean
  onClose: () => void
  onChoose: (preset: Preset) => void
}

type Load<T> = { status: 'idle' } | { status: 'loading' } | { status: 'done'; data: T } | { status: 'error'; message: string }

const FALLBACK_ERROR = 'プリセットを読み込めませんでした。時間をおいて、もう一度お試しください。'
const DIVISIONS: Division[] = ['E', 'C', 'W']

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

  if (key === null) {
    return { status: 'idle' }
  }
  return state.key === key ? state.value : { status: 'loading' }
}

/** 選手を読み込むボタンの要素ID (上書きの確認をキャンセルしたら、ここへフォーカスを戻す) */
function loadButtonId(preset: Preset): string {
  return `preset-load-${preset.id}`
}

/**
 * プリセットを選ぶダイアログ。シーズン → 球団 (リーグ・地区ごと) → 選手 の順に選ぶ。名前での検索も使える。
 * 表示する数値はすべて API が返した値で、ここでは桁をそろえるだけ。
 *
 * 選手の一覧は、選んだ球団のボタンの直後に置く (開閉できる「ディスクロージャー」の形。aria-expanded)。
 * こうすると、キーボードでは球団のボタンの次に選手へ進める (ほかの球団のボタンを通らない)。
 * 広い画面では、CSS で見た目だけ右側に出す (読み上げとキーボードの順番は変わらない)。
 */
export default function PresetDialog({ open, targetName, targetHasValues, onClose, onChoose }: PresetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const searchId = useId()
  const seasonId = useId()
  const [season, setSeason] = useState<number | null>(null)
  const [team, setTeam] = useState<string | null>(null)
  const [queryText, setQueryText] = useState('')
  const [query, setQuery] = useState('')
  /** 上書きの確認を出している選手 (出していなければ null) */
  const [confirming, setConfirming] = useState<Preset | null>(null)

  // ブラウザ標準のダイアログ (モーダル) を開閉する
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

  function pick(preset: Preset) {
    if (targetHasValues) {
      setConfirming(preset)
    } else {
      onChoose(preset)
    }
  }

  function cancelConfirm() {
    const preset = confirming
    setConfirming(null)
    // 確認を閉じたら、選んでいた選手の「読み込む」ボタンへフォーカスを戻す
    if (preset !== null) {
      requestAnimationFrame(() => document.getElementById(loadButtonId(preset))?.focus())
    }
  }

  // Esc キー: 上書きの確認が出ていれば確認だけを閉じる。出ていなければダイアログを閉じる。
  // ブラウザ標準の動き (cancel イベント) に加えて、ダイアログの中で押されたキーも直接受け取る
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented || confirming !== null) {
      return
    }
    event.preventDefault()
    onClose()
  }

  // 中の確認ダイアログの cancel・close イベントも、React ではここまで伝わってくる。
  // このダイアログ自身のイベントのときだけ扱う (確認を閉じたときに、こちらまで閉じないように)
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) {
      return
    }
    event.preventDefault()
    if (confirming === null) {
      onClose()
    }
  }

  function handleClose(event: SyntheticEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const playerList = (
    <PlayerList
      players={players}
      targetName={targetName}
      onPick={pick}
    />
  )

  return (
    <dialog
      ref={dialogRef}
      className="preset-dialog"
      aria-labelledby={titleId}
      onClose={handleClose}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
    >
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

      {/* 検索の結果は、検索欄の直後に出す (キーボードでも検索欄の次に進める) */}
      {query !== '' && (
        <section className="preset-players preset-search-results" aria-label={`「${query}」の検索結果`}>
          <h3>「{query}」の検索結果</h3>
          {playerList}
        </section>
      )}

      <div className="preset-dialog-body">
        <div className="preset-teams">
          <h3>球団</h3>
          {teams.status === 'loading' && <p role="status">球団の一覧を読み込んでいます…</p>}
          {teams.status === 'error' && <p className="message-error">{teams.message}</p>}
          {teams.status === 'done' &&
            teams.data.leagues.map((group) => (
              <section key={group.league} aria-label={LEAGUE_LABELS[group.league]} className="preset-league">
                <h4>{LEAGUE_LABELS[group.league]}</h4>
                {divisionGroups(group.teams).map(({ division, teams: divisionTeams }) => (
                  <div key={division ?? 'none'} className="preset-division">
                    <h5>{division ? DIVISION_LABELS[division] : '地区の情報なし'}</h5>
                    <ul className="preset-team-list">
                      {divisionTeams.map((t) => {
                        const expanded = query === '' && team === t.code
                        const panelId = `preset-team-panel-${t.code}`
                        return (
                          <li key={t.code}>
                            <button
                              type="button"
                              className="preset-team-button"
                              aria-expanded={expanded}
                              aria-controls={expanded ? panelId : undefined}
                              onClick={() => {
                                clearSearch()
                                setTeam(t.code)
                              }}
                            >
                              {teamLabel(t)}
                              <span className="preset-team-count">{t.count}人</span>
                            </button>
                            {expanded && (
                              <section
                                id={panelId}
                                className="preset-players preset-team-panel"
                                aria-label={`${teamLabel(t)} の選手`}
                              >
                                <h3>{teamLabel(t)} の選手</h3>
                                {playerList}
                              </section>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
        </div>
        {query === '' && team === null && teams.status === 'done' && (
          <p className="note preset-players-hint">球団を選ぶか、選手名で検索してください。</p>
        )}
      </div>

      <ConfirmOverwrite
        preset={confirming}
        targetName={targetName}
        onConfirm={() => {
          const preset = confirming
          setConfirming(null)
          if (preset !== null) {
            onChoose(preset)
          }
        }}
        onCancel={cancelConfirm}
      />
    </dialog>
  )
}

/** リーグの中の球団を、地区 (東・中・西) ごとに分ける。API が地区の順・球団名の順に並べて返す */
function divisionGroups(teams: PresetTeam[]): { division: Division | null; teams: PresetTeam[] }[] {
  const groups: { division: Division | null; teams: PresetTeam[] }[] = DIVISIONS.map((division) => ({
    division,
    teams: teams.filter((t) => t.division === division),
  }))
  groups.push({ division: null, teams: teams.filter((t) => t.division === null) })
  return groups.filter((group) => group.teams.length > 0)
}

function PlayerList({
  players,
  targetName,
  onPick,
}: {
  players: Load<PresetSearchResult>
  targetName: string
  onPick: (preset: Preset) => void
}) {
  return (
    <>
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
            <PlayerRow key={preset.id} preset={preset} targetName={targetName} onPick={onPick} />
          ))}
        </ul>
      )}
    </>
  )
}

function PlayerRow({
  preset,
  targetName,
  onPick,
}: {
  preset: Preset
  targetName: string
  onPick: (preset: Preset) => void
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
        {moved && <p className="preset-player-moved">年間合計（複数球団）／{teamsPlayedLabel(moved)}</p>}
        <p className="preset-player-stats">
          打率 {formatRate(summary.AVG)} ／ 出塁率 {formatRate(summary.OBP)} ／ 長打率 {formatRate(summary.SLG)} ／
          OPS {formatRate(summary.OPS)} ／ 本塁打 {summary.HR} ／ 打席 {summary.PA}
        </p>
      </div>
      <button
        type="button"
        id={loadButtonId(preset)}
        aria-label={`${preset.name}（${team}）を${targetName}に読み込む`}
        aria-describedby={detailId}
        onClick={() => onPick(preset)}
      >
        読み込む
      </button>
    </li>
  )
}

/**
 * 入力済みの打者に読み込む前の確認。プリセットのダイアログの上に重ねて開く、もう1つのモーダルダイアログ。
 * Esc キーはこの確認だけを閉じ (キャンセル)、プリセットのダイアログは閉じない。
 */
function ConfirmOverwrite({
  preset,
  targetName,
  onConfirm,
  onCancel,
}: {
  preset: Preset | null
  targetName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const messageId = useId()
  const open = preset !== null

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) {
      return
    }
    if (open && !dialog.open) {
      dialog.showModal()
      confirmRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="preset-confirm"
      role="alertdialog"
      aria-labelledby={messageId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // 外側のプリセットのダイアログまで伝えない (外側は閉じない)
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      {preset && (
        <>
          <p id={messageId}>
            {targetName}の入力を上書きします。よろしいですか？
          </p>
          <p className="note">読み込む選手：{preset.name}（成績と名前が入れ替わります）</p>
          <div className="copy-actions">
            <button type="button" ref={confirmRef} onClick={onConfirm}>
              上書きする
            </button>
            <button type="button" className="button-secondary" onClick={onCancel}>
              キャンセル
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}

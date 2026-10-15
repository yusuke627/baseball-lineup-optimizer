import { STAT_KEYS, type Preset, type StatKey } from '../api/types'
import { emptyRawStats, type RawStats } from '../validation'

export const LINEUP_SIZE = 9

/**
 * 打者の枠。id は枠ごとに固定の内部IDで、API に送る打者IDとして使う (画面には出さない)。
 * 画面に出すのは表示名 (name) で、利用者が自由に変えられる。
 * 既定の表示名は、打順の番号と混同しないよう A〜I の文字で表す。
 */
export interface BatterSlot {
  id: string
  /** 入力欄の内容そのまま (前後の空白を含みうる)。画面や API には displayName() を使う */
  name: string
  defaultName: string
  raw: RawStats
  /** 一度でも入力欄から離れた項目。未入力エラーを早く出しすぎないために使う */
  touched: Partial<Record<StatKey, boolean>>
  /**
   * 読み込んだプリセット (API が返したまま)。手入力の打者と、ほかの打者からコピーした打者は null。
   * 読み込んだあとに成績を編集しても残す (編集済みかどうかは isPresetEdited で判定する)
   */
  preset: Preset | null
}

export interface LineupState {
  /** 成績を入力する枠 (入力画面のカードの並び。順番は変わらない) */
  slots: BatterSlot[]
  /** 打順 (1番から9番)。打者の内部IDの並び */
  order: string[]
}

export type LineupAction =
  | { type: 'setStat'; slotId: string; key: StatKey; value: string }
  | { type: 'touchStat'; slotId: string; key: StatKey }
  | { type: 'setName'; slotId: string; value: string }
  | { type: 'commitName'; slotId: string }
  | { type: 'copyStats'; fromId: string; toIds: string[] }
  | { type: 'loadPreset'; slotId: string; preset: Preset; name: string }
  | { type: 'revertPreset'; slotId: string }
  /** 打順の中で、from 番目 (0始まり) の打者を to 番目に動かす。ほかの打者は順番を保ったまま詰める */
  | { type: 'moveInOrder'; from: number; to: number }

/** 打順の並べ替え。範囲外や同じ位置への移動は、元の並びをそのまま返す */
export function moveInOrder(order: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
    return order
  }
  const next = [...order]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** プリセットの成績を、入力欄の文字列にする */
export function presetRawStats(preset: Preset): RawStats {
  const raw = emptyRawStats()
  for (const key of STAT_KEYS) {
    const value = preset.stats[key]
    raw[key] = value === undefined ? '' : String(value)
  }
  return raw
}

/** 入力欄の1項目を比べるための値。空欄の犠打は0として扱う (送るときと同じ) */
function comparableValue(key: StatKey, text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '' && key === 'SH') {
    return 0
  }
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null
}

/** プリセットを読み込んだあとに、成績が1項目でも変わっているか (値を元に戻せば false に戻る) */
export function isPresetEdited(slot: Pick<BatterSlot, 'raw' | 'preset'>): boolean {
  const { preset } = slot
  if (preset === null) {
    return false
  }
  const original = presetRawStats(preset)
  return STAT_KEYS.some((key) => {
    const current = comparableValue(key, slot.raw[key])
    return current === null || current !== comparableValue(key, original[key])
  })
}

/** 画面と API で使う表示名。前後の空白を除き、空欄なら既定名にする */
export function displayName(slot: Pick<BatterSlot, 'name' | 'defaultName'>): string {
  return slot.name.trim() || slot.defaultName
}

/** 成績の欄に、1つでも入力があるか (空白だけの欄は入力なしとして扱う) */
export function hasAnyStat(slot: Pick<BatterSlot, 'raw'>): boolean {
  return Object.values(slot.raw).some((text) => text.trim() !== '')
}

/** 入力欄の要素ID。エラーのある欄へフォーカスを移すときに使う */
export function statFieldId(slotId: string, key: StatKey): string {
  return `stat-${slotId}-${key}`
}

export function nameFieldId(slotId: string): string {
  return `name-${slotId}`
}

export function createInitialLineup(): LineupState {
  const slots = Array.from({ length: LINEUP_SIZE }, (_, index) => {
    const defaultName = `打者${String.fromCharCode('A'.charCodeAt(0) + index)}`
    return {
      id: `b${index + 1}`,
      name: defaultName,
      defaultName,
      raw: emptyRawStats(),
      touched: {},
      preset: null,
    }
  })
  return { slots, order: slots.map((slot) => slot.id) }
}

function updateSlot(
  state: LineupState,
  slotId: string,
  update: (slot: BatterSlot) => BatterSlot,
): LineupState {
  return { ...state, slots: state.slots.map((slot) => (slot.id === slotId ? update(slot) : slot)) }
}

export function lineupReducer(state: LineupState, action: LineupAction): LineupState {
  switch (action.type) {
    case 'setStat':
      return updateSlot(state, action.slotId, (slot) => ({
        ...slot,
        raw: { ...slot.raw, [action.key]: action.value },
      }))
    case 'touchStat':
      return updateSlot(state, action.slotId, (slot) => ({
        ...slot,
        touched: { ...slot.touched, [action.key]: true },
      }))
    case 'setName':
      return updateSlot(state, action.slotId, (slot) => ({ ...slot, name: action.value }))
    case 'commitName':
      // 欄を離れたとき: 前後の空白を除き、空欄なら既定名に戻す
      return updateSlot(state, action.slotId, (slot) => {
        const name = displayName(slot)
        return name === slot.name ? slot : { ...slot, name }
      })
    case 'copyStats': {
      // 写すのは成績の入力内容だけ (空欄は空欄のまま写す)。表示名と内部IDは変えない。
      // コピー先はプリセットとの結びつきを外し、手入力の扱いにする (参考値などは写さない)
      const source = state.slots.find((slot) => slot.id === action.fromId)
      if (source === undefined) {
        return state
      }
      return {
        ...state,
        slots: state.slots.map((slot) =>
          action.toIds.includes(slot.id) && slot.id !== source.id
            ? { ...slot, raw: { ...source.raw }, touched: {}, preset: null }
            : slot,
        ),
      }
    }
    case 'loadPreset':
      return updateSlot(state, action.slotId, (slot) => ({
        ...slot,
        name: action.name,
        raw: presetRawStats(action.preset),
        touched: {},
        preset: action.preset,
      }))
    case 'moveInOrder': {
      const order = moveInOrder(state.order, action.from, action.to)
      return order === state.order ? state : { ...state, order }
    }
    case 'revertPreset':
      return updateSlot(state, action.slotId, (slot) =>
        slot.preset === null ? slot : { ...slot, raw: presetRawStats(slot.preset), touched: {} },
      )
  }
}

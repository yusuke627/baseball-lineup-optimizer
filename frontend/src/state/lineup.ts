import type { StatKey } from '../api/types'
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
      // 写すのは成績の入力内容だけ (空欄は空欄のまま写す)。表示名と内部IDは変えない
      const source = state.slots.find((slot) => slot.id === action.fromId)
      if (source === undefined) {
        return state
      }
      return {
        ...state,
        slots: state.slots.map((slot) =>
          action.toIds.includes(slot.id) && slot.id !== source.id
            ? { ...slot, raw: { ...source.raw }, touched: {} }
            : slot,
        ),
      }
    }
  }
}

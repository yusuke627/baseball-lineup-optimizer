import type { StatKey } from '../api/types'
import { emptyRawStats, type RawStats } from '../validation'

export const LINEUP_SIZE = 9

/**
 * 打者の枠。id は枠ごとに固定で、API に送る打者IDとしても使う
 * (同じプリセット選手を複数の枠に入れても区別でき、API の warnings にもこの名前が出る)。
 * 打順の番号と混同しないよう、A〜I の文字で表す。
 */
export interface BatterSlot {
  id: string
  raw: RawStats
  /** 一度でも入力欄から離れた項目。未入力エラーを早く出しすぎないために使う */
  touched: Partial<Record<StatKey, boolean>>
}

export interface LineupState {
  slots: BatterSlot[]
}

export type LineupAction =
  | { type: 'setStat'; slotId: string; key: StatKey; value: string }
  | { type: 'touchStat'; slotId: string; key: StatKey }

export function createInitialLineup(): LineupState {
  const slots = Array.from({ length: LINEUP_SIZE }, (_, index) => ({
    id: `打者${String.fromCharCode('A'.charCodeAt(0) + index)}`,
    raw: emptyRawStats(),
    touched: {},
  }))
  return { slots }
}

function updateSlot(
  state: LineupState,
  slotId: string,
  update: (slot: BatterSlot) => BatterSlot,
): LineupState {
  return { slots: state.slots.map((slot) => (slot.id === slotId ? update(slot) : slot)) }
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
  }
}

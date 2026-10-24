import { describe, expect, test } from 'vitest'

import type { Preset } from '../api/types'
import { createInitialLineup, hasAnyStat, lineupReducer, moveInOrder, showsFields } from './lineup'

const ORDER = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']

describe('打順の並べ替え (moveInOrder)', () => {
  test('下へ1つ・上へ1つ', () => {
    expect(moveInOrder(ORDER, 2, 3)).toEqual(['b1', 'b2', 'b4', 'b3', 'b5', 'b6', 'b7', 'b8', 'b9'])
    expect(moveInOrder(ORDER, 2, 1)).toEqual(['b1', 'b3', 'b2', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'])
  })

  test('N番へ移動すると、間の打者は順番を保ったまま詰める', () => {
    expect(moveInOrder(ORDER, 2, 0)).toEqual(['b3', 'b1', 'b2', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'])
    expect(moveInOrder(ORDER, 0, 8)).toEqual(['b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b1'])
    expect(moveInOrder(ORDER, 8, 0)).toEqual(['b9', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'])
  })

  test('先頭より上・末尾より下・同じ位置への移動は、元の並びのまま (同じ配列を返す)', () => {
    expect(moveInOrder(ORDER, 0, -1)).toBe(ORDER)
    expect(moveInOrder(ORDER, 8, 9)).toBe(ORDER)
    expect(moveInOrder(ORDER, 4, 4)).toBe(ORDER)
    expect(moveInOrder(ORDER, -1, 2)).toBe(ORDER)
  })

  test('元の配列は書き換えない', () => {
    const order = [...ORDER]
    moveInOrder(order, 0, 8)
    expect(order).toEqual(ORDER)
  })

  test('reducer の moveInOrder は打順だけを変え、入力の枠は変えない', () => {
    const state = createInitialLineup()
    const next = lineupReducer(state, { type: 'moveInOrder', from: 2, to: 0 })
    expect(next.order).toEqual(['b3', 'b1', 'b2', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'])
    expect(next.slots).toBe(state.slots)
    expect(lineupReducer(state, { type: 'moveInOrder', from: 0, to: -1 })).toBe(state)
  })
})

describe('カードの状態 (未選択・選手データ・手入力)', () => {
  // テスト用の合成の選手データ (実在の選手の記録ではない)
  const PRESET = {
    id: 'test_2025',
    name: 'Test Player',
    season: 2025,
    league: 'MLB',
    verified: false,
    source: { provider: 'テスト用', url: 'https://example.com/', retrieved_at: '2026-01-01' },
    stats: { PA: 600, AB: 540, H: 150, '2B': 30, '3B': 5, HR: 15, BB: 40, HBP: 10, SO: 100, SF: 5, SH: 5, GIDP: 10, SB: 10, CS: 3 },
    summary: { PA: 600, HR: 15, AVG: 0.278, OBP: 0.336, SLG: 0.426, OPS: 0.762, SB: 10, CS: 3, SB_pct: 0.769 },
    reference_metrics: null,
  } as unknown as Preset

  test('初めは9人とも未選択で、成績は空', () => {
    const state = createInitialLineup()
    expect(state.slots.map((slot) => [slot.mode, slot.editing, hasAnyStat(slot)])).toEqual(
      Array(9).fill(['unselected', false, false]),
    )
  })

  test('手入力 → 入力欄を出す。選手データの読み込み → 要約 (編集中ではない)', () => {
    let state = lineupReducer(createInitialLineup(), { type: 'startManual', slotId: 'b1' })
    expect(state.slots[0].mode).toBe('manual')
    expect(showsFields(state.slots[0])).toBe(true)
    state = lineupReducer(state, { type: 'loadPreset', slotId: 'b1', preset: PRESET, name: 'Test Player' })
    expect([state.slots[0].mode, state.slots[0].editing, showsFields(state.slots[0])]).toEqual(['preset', false, false])
    state = lineupReducer(state, { type: 'setEditing', slotId: 'b1', editing: true })
    expect(showsFields(state.slots[0])).toBe(true)
  })

  test('「選択を外す」で、成績・表示名・選手データを初めの状態に戻す', () => {
    let state = lineupReducer(createInitialLineup(), { type: 'loadPreset', slotId: 'b2', preset: PRESET, name: 'Test Player' })
    state = lineupReducer(state, { type: 'clearSelection', slotId: 'b2' })
    expect(state.slots[1]).toEqual(createInitialLineup().slots[1])
  })

  test('コピー先は手入力になる (未選択のカードも、編集中の選手データのカードも)', () => {
    let state = createInitialLineup()
    state = lineupReducer(state, { type: 'startManual', slotId: 'b1' })
    state = lineupReducer(state, { type: 'setStat', slotId: 'b1', key: 'HR', value: '12' })
    state = lineupReducer(state, { type: 'loadPreset', slotId: 'b3', preset: PRESET, name: 'Test Player' })
    state = lineupReducer(state, { type: 'setEditing', slotId: 'b3', editing: true })
    state = lineupReducer(state, { type: 'copyStats', fromId: 'b1', toIds: ['b2', 'b3'] })
    for (const slot of [state.slots[1], state.slots[2]]) {
      expect([slot.mode, slot.editing, slot.preset, slot.raw.HR]).toEqual(['manual', false, null, '12'])
    }
  })

  test('API に送る値 (raw と表示名) の形は、カードの状態にかかわらず同じ', () => {
    const state = lineupReducer(createInitialLineup(), { type: 'loadPreset', slotId: 'b1', preset: PRESET, name: 'Test Player' })
    const slot = state.slots[0]
    expect(Object.keys(slot.raw).sort()).toEqual(Object.keys(createInitialLineup().slots[0].raw).sort())
    expect(slot.raw.PA).toBe('600')
  })
})

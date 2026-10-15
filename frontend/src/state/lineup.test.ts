import { describe, expect, test } from 'vitest'

import { createInitialLineup, lineupReducer, moveInOrder } from './lineup'

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

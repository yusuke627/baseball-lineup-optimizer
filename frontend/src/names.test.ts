import { describe, expect, test } from 'vitest'

// バックエンドのテスト (backend/tests/test_validation.py) と同じ入力例を使い、検証結果が一致することを確認する
import casesFile from '../../schemas/display_name_validation_cases.json'
import { checkDisplayName, findNameIssues, MAX_DISPLAY_NAME_LENGTH } from './names'

interface SharedNameCase {
  name: string
  value: string
  valid: boolean
  normalized: string | null
  rule: string | null
}

const cases = casesFile.cases as SharedNameCase[]

describe('バックエンドと共通の表示名の例', () => {
  test('入力例は14件ある', () => {
    expect(cases).toHaveLength(14)
  })

  test('最大文字数がバックエンドと同じ', () => {
    expect(MAX_DISPLAY_NAME_LENGTH).toBe(casesFile.max_length)
  })

  test.each(cases)('$name', (testCase) => {
    const check = checkDisplayName(testCase.value)

    expect(check.ok).toBe(testCase.valid)
    if (check.ok) {
      expect(check.name).toBe(testCase.normalized)
    } else {
      expect(check.issue.rule).toBe(testCase.rule)
    }
  })
})

describe('表示名の重複', () => {
  const names = (...values: string[]) => values.map((name, index) => ({ id: `b${index + 1}`, name }))

  test('重複が無ければ問題なし', () => {
    expect(findNameIssues(names('打者A', '打者B', '打者C'))).toEqual({})
  })

  test('同じ名前の打者は、全員を重複として報告する', () => {
    const issues = findNameIssues(names('打者A', '打者B', '打者A'))
    expect(Object.keys(issues).sort()).toEqual(['b1', 'b3'])
    expect(issues.b1.rule).toBe('DUPLICATE')
  })

  test('前後の空白を除いて比べる', () => {
    const issues = findNameIssues(names('打者A', ' 打者A '))
    expect(Object.keys(issues).sort()).toEqual(['b1', 'b2'])
  })

  test('大文字と小文字は区別する', () => {
    expect(findNameIssues(names('judge', 'Judge'))).toEqual({})
  })

  test('名前そのものに問題がある打者は、その問題を報告する', () => {
    const issues = findNameIssues(names('あ'.repeat(21), '打者B'))
    expect(issues.b1.rule).toBe('LENGTH')
    expect(issues.b2).toBeUndefined()
  })
})

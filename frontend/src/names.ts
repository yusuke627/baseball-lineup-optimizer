// 打者の表示名の検証。ルールはバックエンド (backend/app/schemas/batter.py の normalize_display_name) と同じにする。
// 両者の一致は、共通の入力例 schemas/display_name_validation_cases.json を使ったテストで確認している。

/** 表示名の最大文字数 (前後の空白を除いたあとの文字数。バックエンドと同じ値) */
export const MAX_DISPLAY_NAME_LENGTH = 40

export type NameRuleId = 'EMPTY' | 'LENGTH' | 'CONTROL' | 'DUPLICATE'

export interface NameIssue {
  rule: NameRuleId
  message: string
}

export type NameCheck = { ok: true; name: string } | { ok: false; issue: NameIssue }

/** 制御文字 (改行・タブなど。U+0000〜U+001F と U+007F〜U+009F) かどうか */
function isControlCharacter(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
}

/** 表示名を検証し、前後の空白を除いた名前を返す。文字数は符号位置の数で数える (バックエンドと同じ) */
export function checkDisplayName(value: string): NameCheck {
  const chars = [...value]
  if (chars.some(isControlCharacter)) {
    return {
      ok: false,
      issue: { rule: 'CONTROL', message: '表示名に改行やタブなどの制御文字は使えません。' },
    }
  }
  const name = value.trim()
  if (name === '') {
    return { ok: false, issue: { rule: 'EMPTY', message: '表示名を入力してください。' } }
  }
  if ([...name].length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      issue: {
        rule: 'LENGTH',
        message: `表示名は${MAX_DISPLAY_NAME_LENGTH}文字以内で入力してください。`,
      },
    }
  }
  return { ok: true, name }
}

/**
 * ほかの打者と重ならない表示名を作る。base が使われていなければそのまま、
 * 使われていれば「base (2)」「base (3)」… のうち空いている最小の番号を付ける
 */
export function uniqueDisplayName(base: string, otherNames: string[]): string {
  const taken = new Set(otherNames.map((name) => name.trim()))
  const name = base.trim()
  if (!taken.has(name)) {
    return name
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`
    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

/**
 * 打者ごとの表示名の問題を返す (問題が無い打者は含めない)。
 * 同じ名前が複数あるときは、その全員を重複として報告する。
 */
export function findNameIssues(names: { id: string; name: string }[]): Record<string, NameIssue> {
  const issues: Record<string, NameIssue> = {}
  const idsByName = new Map<string, string[]>()

  for (const { id, name } of names) {
    const check = checkDisplayName(name)
    if (!check.ok) {
      issues[id] = check.issue
      continue
    }
    idsByName.set(check.name, [...(idsByName.get(check.name) ?? []), id])
  }
  for (const ids of idsByName.values()) {
    if (ids.length > 1) {
      for (const id of ids) {
        issues[id] = {
          rule: 'DUPLICATE',
          message: '表示名がほかの打者と重複しています。別の名前にしてください。',
        }
      }
    }
  }
  return issues
}

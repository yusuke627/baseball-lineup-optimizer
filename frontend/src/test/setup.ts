import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom はブラウザ標準のダイアログ (<dialog> の showModal・close) を実装していないため、
// テストでは開く・閉じるだけを置き換える。フォーカスの閉じ込めや Esc キーで閉じる動きは、
// ブラウザ本来の動作で、テストでは確認していない。
const dialogPrototype = globalThis.HTMLDialogElement?.prototype as
  | (HTMLDialogElement & { showModal?: () => void; close?: () => void })
  | undefined
if (dialogPrototype && typeof dialogPrototype.showModal !== 'function') {
  dialogPrototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dialogPrototype.close = function close(this: HTMLDialogElement) {
    if (this.hasAttribute('open')) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
}

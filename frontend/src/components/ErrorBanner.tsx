import { ABORTED_DETAIL, type ApiErrorKind } from '../api/client'
import Disclosure from './Disclosure'

export interface DisplayError {
  kind: ApiErrorKind
  message: string
}

const TITLES: Record<ApiErrorKind, string> = {
  input: '入力エラー',
  api: 'サーバーのエラー',
  network: '通信エラー',
  aborted: 'キャンセル',
}

export default function ErrorBanner({ error }: { error: DisplayError }) {
  // キャンセルは利用者自身の操作の結果なので、エラーとしては読み上げない
  const isCancel = error.kind === 'aborted'
  return (
    <div
      className={isCancel ? 'banner banner-info' : 'banner banner-error'}
      role={isCancel ? 'status' : 'alert'}
    >
      <strong>{TITLES[error.kind]}：</strong>
      {error.message}
      {isCancel && (
        <Disclosure name="キャンセルについての説明">
          <p>{ABORTED_DETAIL}</p>
        </Disclosure>
      )}
    </div>
  )
}

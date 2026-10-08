import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import App from './App'

test('見出しが表示される', () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: '打順の得点期待値' })).toBeInTheDocument()
})

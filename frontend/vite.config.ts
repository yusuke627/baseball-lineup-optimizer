import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// フロントエンドは API を相対パス /api/... で呼ぶ。
// 開発時は Vite のプロキシが /api を FastAPI (localhost:8000) に転送するので CORS の設定は要らない。
// バックエンドのパスには /api が付いていないため、転送時に取り除く。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

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
    // 時間切れの上限 (既定は testTimeout 5000ms・hookTimeout 10000ms)。9人分の入力と計算をするテストは、
    // 手元の並列実行で 1件 4秒台になり、CI では 5000ms を超えて失敗したため上げる。
    // 30000ms は、手元の1ワーカー実行の最大 2.52秒の約12倍、既定の並列実行の最大 4.16秒の約7倍 (2026-10-26 の測定)
    testTimeout: 30000,
    hookTimeout: 30000,
    // CI (GitHub Actions は環境変数 CI を設定する) では、ワーカーを2つにして CPU の取り合いを減らす。手元の実行は既定のまま
    maxWorkers: process.env.CI ? 2 : undefined,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// PANE_NUMBERを自動検出（環境変数 → worktreeパス名 → null）
// NOTE: @kurimats/shared を直接importするとCI環境でモジュール解決に失敗するためインライン化
function detectPaneNumber(): number | null {
  const envVal = process.env.PANE_NUMBER
  if (envVal != null && envVal !== '') {
    const n = parseInt(envVal, 10)
    if (!isNaN(n)) return n
  }
  const match = process.cwd().match(/-pane(\d+)(?:\/|$)/)
  return match ? parseInt(match[1], 10) : null
}

const paneNumber = detectPaneNumber()
const serverPort = paneNumber != null
  ? String(14000 + paneNumber)
  : (process.env.SERVER_PORT || '3001')
const clientPort = paneNumber != null
  ? 5180 + paneNumber
  : parseInt(process.env.CLIENT_PORT || '5173', 10)

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: clientPort,
    proxy: {
      '/api': `http://localhost:${serverPort}`,
      '/ws': {
        target: `ws://localhost:${serverPort}`,
        ws: true,
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { detectPaneNumber } from '@kurimats/shared'

// PANE_NUMBERを自動検出（環境変数 → worktreeパス名 → null）
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

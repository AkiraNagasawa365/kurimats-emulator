import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ペイン番号からポートを自動算出（PANE_NUMBERが設定されていれば既存env変数より優先）
const paneNumber = parseInt(process.env.PANE_NUMBER || '0', 10)
const serverPort = paneNumber > 0
  ? String(14000 + paneNumber)
  : (process.env.SERVER_PORT || '3001')
const clientPort = paneNumber > 0
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

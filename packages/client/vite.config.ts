import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// PANE_NUMBERからポートを自動算出（develop=0, paneN=N）
// 設定時は既存env変数より優先。未設定時のみSERVER_PORT/CLIENT_PORTにフォールバック
const paneNumber = process.env.PANE_NUMBER != null
  ? parseInt(process.env.PANE_NUMBER, 10)
  : null
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

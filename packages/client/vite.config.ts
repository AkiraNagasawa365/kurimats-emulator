import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ペイン番号からポートを自動算出（PANE_NUMBER未設定時はデフォルトを維持）
const paneNumber = parseInt(process.env.PANE_NUMBER || '0', 10)
const serverPort = process.env.SERVER_PORT || String(paneNumber > 0 ? 14000 + paneNumber : 3001)
const clientPort = parseInt(process.env.CLIENT_PORT || String(paneNumber > 0 ? 5180 + paneNumber : 5173), 10)

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

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const serverPort = process.env.SERVER_PORT || '3001'
const clientPort = parseInt(process.env.CLIENT_PORT || '5173', 10)

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

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { PtyManager } from './services/pty-manager.js'
import { WorktreeService } from './services/worktree-service.js'
import { SessionStore } from './services/session-store.js'
import { setupTerminalWs } from './ws/terminal-handler.js'
import { createSessionsRouter } from './routes/sessions.js'
import { createFilesRouter } from './routes/files.js'
import { createWorktreesRouter } from './routes/worktrees.js'
import { createProjectsRouter } from './routes/projects.js'
import { createLayoutRouter } from './routes/layout.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

// サービス初期化
const ptyManager = new PtyManager()
const worktreeService = new WorktreeService()
const sessionStore = new SessionStore()

// Express設定
const app = express()
app.use(cors())
app.use(express.json())

// REST APIルーティング
app.use('/api/sessions', createSessionsRouter(sessionStore, ptyManager, worktreeService))
app.use('/api/files', createFilesRouter())
app.use('/api/worktrees', createWorktreesRouter(worktreeService))
app.use('/api/projects', createProjectsRouter(sessionStore))
app.use('/api/layout', createLayoutRouter(sessionStore))

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', activeSessions: ptyManager.getActiveSessionIds().length })
})

// HTTPサーバー作成
const server = createServer(app)

// WebSocketサーバー（ターミナル用）
const terminalWss = new WebSocketServer({ noServer: true })
setupTerminalWs(terminalWss, ptyManager)

// WebSocketアップグレード処理
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`)

  if (url.pathname.startsWith('/ws/terminal/')) {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

// サーバー起動
server.listen(PORT, () => {
  console.log(`🚀 Kurimats Emulator サーバー起動: http://localhost:${PORT}`)
})

// グレースフルシャットダウン
function shutdown() {
  console.log('\nシャットダウン中...')
  ptyManager.killAll()
  sessionStore.close()
  server.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

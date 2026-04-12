import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { PtyManager } from './services/pty-manager.js'
import { SshManager } from './services/ssh-manager.js'
import { WorktreeService } from './services/worktree-service.js'
import { SessionStore } from './services/session-store.js'
import { DevInstanceManager } from './services/dev-instance-manager.js'
import { SessionDevBindingService } from './services/session-dev-binding-service.js'
import { PlaywrightRunner } from './services/playwright-runner.js'
import { createPlaywrightRouter } from './routes/playwright.js'
import { setupTerminalWs } from './ws/terminal-handler.js'
import { setupNotificationWs } from './ws/notification-handler.js'
import { createSessionsRouter } from './routes/sessions.js'
import { createFilesRouter } from './routes/files.js'
import { createWorktreesRouter } from './routes/worktrees.js'
import { createProjectsRouter } from './routes/projects.js'
import { createLayoutRouter } from './routes/layout.js'
import { createTabRouter } from './routes/tab.js'
import { createSshRouter } from './routes/ssh.js'
import { createFeedbackRouter } from './routes/feedback.js'
import { createWorkspacesRouter } from './routes/workspaces.js'
import { CanvasStore } from './services/canvas-store.js'
import { SERVER_PORT_BASE, calculatePort } from './utils/ports.js'
import { runStartupTasks } from './startup.js'
import { acquireLock, registerLockCleanup } from './services/leader-lock.js'

// PANE_NUMBERからポートを自動算出（develop=0, paneN=N）
// 設定時は既存PORT環境変数より優先。未設定時のみPORTにフォールバック
const PANE_NUMBER = process.env.PANE_NUMBER != null
  ? parseInt(process.env.PANE_NUMBER, 10)
  : null
const PORT = PANE_NUMBER != null
  ? calculatePort(SERVER_PORT_BASE, PANE_NUMBER)
  : parseInt(process.env.PORT || '3001', 10)
const HOST = process.env.HOST || 'localhost'

// トークン認証（リモートアクセス用、オプション）
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''

// LeaderLock: 重複サーバー起動を防止
const lockResult = acquireLock({
  port: PORT,
  paneNumber: PANE_NUMBER,
  type: PANE_NUMBER != null ? 'dev' : 'electron',
})
if (!lockResult.acquired) {
  const info = lockResult.existingLock!
  console.error(`❌ LeaderLock: サーバーは既に起動中です (PID=${info.pid}, port=${info.port}, 起動=${info.startedAt})`)
  process.exit(1)
}
registerLockCleanup({ paneNumber: PANE_NUMBER })
console.log(`🔒 LeaderLock: 取得成功 (PID=${process.pid}, port=${PORT})`)

// サービス初期化
const ptyManager = new PtyManager()
const sshManager = new SshManager()
const worktreeService = new WorktreeService()
const sessionStore = new SessionStore()
const canvasStore = new CanvasStore()
const devInstanceManager = new DevInstanceManager(sessionStore)
devInstanceManager.on('error', (instanceId: string, err: unknown) => {
  console.error(`❌ DevInstance ${instanceId} エラー:`, err)
})
const bindingService = new SessionDevBindingService(sessionStore, devInstanceManager)
const playwrightRunner = new PlaywrightRunner()
playwrightRunner.on('runner_error', (instanceId: string, err: unknown) => {
  console.error(`❌ Playwright Runner ${instanceId} エラー:`, err)
})

const markDisconnected = (sessionId: string) => {
  const session = sessionStore.getById(sessionId)
  if (session && session.status === 'active') {
    sessionStore.updateStatus(sessionId, 'disconnected')
  }
}

ptyManager.on('exit', (sessionId: string) => {
  markDisconnected(sessionId)
})

sshManager.on('exit', (sessionId: string) => {
  markDisconnected(sessionId)
})

// サーバー起動時の初期化タスク（orphanedセッション復元、孤立削除、ブランチ修正）
runStartupTasks(sessionStore, worktreeService)

// Express設定
const app = express()
app.use(cors())
app.use(express.json())

// トークン認証ミドルウェア（AUTH_TOKENが設定されている場合のみ）
if (AUTH_TOKEN) {
  app.use('/api', (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ error: '認証トークンが無効です' })
      return
    }
    next()
  })
}

// REST APIルーティング
app.use('/api/sessions', createSessionsRouter(sessionStore, ptyManager, sshManager, worktreeService))
app.use('/api/files', createFilesRouter(sshManager))
app.use('/api/worktrees', createWorktreesRouter(worktreeService))
app.use('/api/projects', createProjectsRouter(sessionStore))
app.use('/api/layout', createLayoutRouter(sessionStore, canvasStore))
app.use('/api/tab', createTabRouter(sessionStore, ptyManager, sshManager, worktreeService))
app.use('/api/ssh', createSshRouter(sshManager, sessionStore))
app.use('/api/feedback', createFeedbackRouter(sessionStore))
app.use('/api/workspaces', createWorkspacesRouter(sessionStore, ptyManager, sshManager, worktreeService, devInstanceManager, bindingService))
app.use('/api/playwright', createPlaywrightRouter(playwrightRunner, devInstanceManager))

// 本番時: 静的ファイル配信（Electronビルド or スタンドアロン）
const STATIC_DIR = process.env.STATIC_DIR
if (STATIC_DIR) {
  const { resolve } = await import('path')
  const staticPath = resolve(STATIC_DIR)
  app.use(express.static(staticPath))
  // SPA フォールバック: API/WS以外のリクエストをindex.htmlに転送
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next()
    }
    res.sendFile(resolve(staticPath, 'index.html'))
  })
}

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeSessions: ptyManager.getActiveSessionIds().length,
    remoteSessions: sshManager.getActiveSessionIds().length,
    sshHosts: sshManager.getHosts().filter(h => h.isConnected).length,
  })
})

// HTTPサーバー作成
const server = createServer(app)

// WebSocketサーバー（ターミナル用）
const terminalWss = new WebSocketServer({ noServer: true })
setupTerminalWs(terminalWss, ptyManager, sshManager)

// WebSocketサーバー（通知用）
const notificationWss = new WebSocketServer({ noServer: true })
setupNotificationWs(notificationWss, sshManager, playwrightRunner)

// WebSocketアップグレード処理
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`)

  // トークン認証（AUTH_TOKENが設定されている場合）
  if (AUTH_TOKEN) {
    const token = url.searchParams.get('token')
    if (token !== AUTH_TOKEN) {
      socket.destroy()
      return
    }
  }

  if (url.pathname.startsWith('/ws/terminal/')) {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request)
    })
  } else if (url.pathname === '/ws/notifications') {
    notificationWss.handleUpgrade(request, socket, head, (ws) => {
      notificationWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

// サーバー起動
server.listen(PORT, HOST, () => {
  console.log(`🚀 Kurimats Emulator サーバー起動: http://${HOST}:${PORT}`)
  if (HOST === '0.0.0.0') {
    console.log('⚠️  外部アクセスが有効です。AUTH_TOKENの設定を推奨します。')
  }
})

// グレースフルシャットダウン
async function shutdown() {
  console.log('\nシャットダウン中...')
  await playwrightRunner.stopAllAndWait()
  devInstanceManager.shutdown()
  ptyManager.killAll()
  sshManager.disconnectAll()
  sessionStore.close()
  server.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  shutdown()
})

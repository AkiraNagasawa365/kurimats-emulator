import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { PtyManager } from './services/pty-manager.js'
import { SshManager } from './services/ssh-manager.js'
import { WorktreeService } from './services/worktree-service.js'
import { SessionStore } from './services/session-store.js'
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

// ペイン番号からポートを自動算出（PANE_NUMBERが設定されていれば既存PORTより優先）
const PANE_NUMBER = parseInt(process.env.PANE_NUMBER || '0', 10)
const PORT = PANE_NUMBER > 0
  ? 14000 + PANE_NUMBER
  : parseInt(process.env.PORT || '3001', 10)
const HOST = process.env.HOST || 'localhost'

// トークン認証（リモートアクセス用、オプション）
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''

// サービス初期化
const ptyManager = new PtyManager()
const sshManager = new SshManager()
const worktreeService = new WorktreeService()
const sessionStore = new SessionStore()
const canvasStore = new CanvasStore()

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

// サーバー起動時: PTYが消失したactiveセッションをdisconnectedに変更
const orphanedSessions = sessionStore.getAll().filter(s => s.status === 'active')
if (orphanedSessions.length > 0) {
  console.log(`⚠️  ${orphanedSessions.length}件のorphanedセッションを検出 → disconnectedに変更`)
  for (const s of orphanedSessions) {
    sessionStore.updateStatus(s.id, 'disconnected')
    console.log(`   ↳ セッション "${s.name}" (${s.id.slice(0, 8)}...) → disconnected`)
  }
  console.log('✅ orphanedセッションの復元処理完了。UIから再接続可能です。')
} else {
  console.log('✅ orphanedセッションなし')
}

// サーバー起動時: ペインツリーに含まれない孤立セッションを削除
try {
  // 全ワークスペースのペインツリーから参照中のセッションIDを収集
  const collectSessionIdsFromTree = (node: import('@kurimats/shared').PaneNode): string[] => {
    if (!node) return []
    if (node.kind === 'leaf') {
      return node.surfaces.filter(s => s.type === 'terminal').map(s => s.target)
    }
    if (!node.children || node.children.length < 2) return []
    return [...collectSessionIdsFromTree(node.children[0]), ...collectSessionIdsFromTree(node.children[1])]
  }

  const workspaces = sessionStore.getAllCmuxWorkspaces()
  const referencedIds = new Set<string>()
  for (const ws of workspaces) {
    for (const id of collectSessionIdsFromTree(ws.paneTree)) {
      referencedIds.add(id)
    }
  }

  // ペインツリーに含まれないセッションを削除（worktreeも含む）
  const allSessions = sessionStore.getAll()
  const orphanedCleanup = allSessions.filter(s => !referencedIds.has(s.id))
  if (orphanedCleanup.length > 0) {
    console.log(`🧹 ${orphanedCleanup.length}件の孤立セッションを削除します`)
    for (const s of orphanedCleanup) {
      if (s.worktreePath && s.repoPath) {
        try {
          worktreeService.remove(s.repoPath, s.worktreePath)
          console.log(`   🗑️ worktree削除: ${s.worktreePath}`)
        } catch {
          // 既に削除済みの場合は無視
        }
      }
      sessionStore.delete(s.id)
      console.log(`   ↳ セッション "${s.name}" (${s.id.slice(0, 8)}...) を削除`)
    }
    console.log('✅ 孤立セッション削除完了')
  } else {
    console.log('✅ 孤立セッションなし')
  }
} catch (e) {
  console.error('⚠️ 孤立セッション削除中にエラー（サーバー起動は続行）:', e)
}

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
app.use('/api/files', createFilesRouter())
app.use('/api/worktrees', createWorktreesRouter(worktreeService))
app.use('/api/projects', createProjectsRouter(sessionStore))
app.use('/api/layout', createLayoutRouter(sessionStore, canvasStore))
app.use('/api/tab', createTabRouter(sessionStore, ptyManager, sshManager))
app.use('/api/ssh', createSshRouter(sshManager, sessionStore))
app.use('/api/feedback', createFeedbackRouter(sessionStore))
app.use('/api/workspaces', createWorkspacesRouter(sessionStore, ptyManager, sshManager, worktreeService))

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
setupNotificationWs(notificationWss, sshManager)

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
function shutdown() {
  console.log('\nシャットダウン中...')
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

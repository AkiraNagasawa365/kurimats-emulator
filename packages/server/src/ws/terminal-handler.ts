import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'
import type { PtyManager } from '../services/pty-manager.js'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'

/**
 * ターミナルWebSocketハンドラー
 * xterm.js ↔ node-pty をWebSocketで橋渡しする
 */
export function setupTerminalWs(wss: WebSocketServer, ptyManager: PtyManager): void {
  // セッションID → 接続中のWebSocketクライアント群
  const clients = new Map<string, Set<WebSocket>>()

  // PTYからの出力をWebSocketクライアントへ転送
  ptyManager.on('data', (sessionId: string, data: string) => {
    const sessionClients = clients.get(sessionId)
    if (!sessionClients) return
    const msg: ServerTerminalMessage = { type: 'output', data }
    const payload = JSON.stringify(msg)
    for (const ws of sessionClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload)
      }
    }
  })

  // PTY終了通知
  ptyManager.on('exit', (sessionId: string, code: number) => {
    const sessionClients = clients.get(sessionId)
    if (!sessionClients) return
    const msg: ServerTerminalMessage = { type: 'exit', code }
    const payload = JSON.stringify(msg)
    for (const ws of sessionClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload)
      }
    }
  })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // URLからセッションIDを抽出: /ws/terminal/:sessionId
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const parts = url.pathname.split('/')
    const sessionId = parts[parts.length - 1]

    if (!sessionId) {
      ws.close(1008, 'セッションIDが必要です')
      return
    }

    // クライアント登録
    if (!clients.has(sessionId)) {
      clients.set(sessionId, new Set())
    }
    clients.get(sessionId)!.add(ws)

    // 接続確認メッセージ
    const connMsg: ServerTerminalMessage = { type: 'connected', sessionId }
    ws.send(JSON.stringify(connMsg))

    // リングバッファの内容を再送（再接続対応）
    const buffer = ptyManager.getBuffer(sessionId)
    if (buffer) {
      const bufMsg: ServerTerminalMessage = { type: 'output', data: buffer }
      ws.send(JSON.stringify(bufMsg))
    }

    // クライアントからのメッセージ処理
    ws.on('message', (raw: Buffer) => {
      try {
        const msg: ClientTerminalMessage = JSON.parse(raw.toString())
        switch (msg.type) {
          case 'input':
            ptyManager.write(sessionId, msg.data)
            break
          case 'resize':
            ptyManager.resize(sessionId, msg.cols, msg.rows)
            break
        }
      } catch {
        // 不正なメッセージは無視
      }
    })

    ws.on('close', () => {
      clients.get(sessionId)?.delete(ws)
      if (clients.get(sessionId)?.size === 0) {
        clients.delete(sessionId)
      }
    })
  })
}

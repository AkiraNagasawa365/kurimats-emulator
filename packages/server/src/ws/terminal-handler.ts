import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'
import type { PtyManager } from '../services/pty-manager.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'

/**
 * ターミナルWebSocketハンドラー
 * xterm.js ↔ PTY/SSH をWebSocketで橋渡しする
 */
export function setupTerminalWs(
  wss: WebSocketServer,
  ptyManager: PtyManager,
  sshManager: SshManager
): void {
  // セッションID → 接続中のWebSocketクライアント群
  const clients = new Map<string, Set<WebSocket>>()

  /**
   * セッションクライアントへメッセージ送信
   */
  function sendToClients(sessionId: string, msg: ServerTerminalMessage): void {
    const sessionClients = clients.get(sessionId)
    if (!sessionClients) return
    const payload = JSON.stringify(msg)
    for (const ws of sessionClients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload)
        } catch {
          sessionClients.delete(ws)
          ws.terminate()
        }
      } else if (ws.readyState !== WebSocket.CONNECTING) {
        sessionClients.delete(ws)
      }
    }
    if (sessionClients.size === 0) {
      clients.delete(sessionId)
    }
  }

  // ローカルPTYからの出力を転送
  ptyManager.on('data', (sessionId: string, data: string) => {
    sendToClients(sessionId, { type: 'output', data })
  })

  ptyManager.on('exit', (sessionId: string, code: number) => {
    sendToClients(sessionId, { type: 'exit', code })
  })

  // リモートSSHからの出力を転送
  sshManager.on('data', (sessionId: string, data: string) => {
    sendToClients(sessionId, { type: 'output', data })
  })

  sshManager.on('exit', (sessionId: string, code: number) => {
    sendToClients(sessionId, { type: 'exit', code })
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

    // セッションがリモートかローカルか判定
    const isRemote = sshManager.hasSession(sessionId)

    // クライアント登録
    if (!clients.has(sessionId)) {
      clients.set(sessionId, new Set())
    }
    clients.get(sessionId)!.add(ws)

    // 接続確認メッセージ
    const connMsg: ServerTerminalMessage = { type: 'connected', sessionId }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(connMsg))
    }

    // リングバッファの内容を再送（再接続対応）
    const buffer = isRemote
      ? sshManager.getBuffer(sessionId)
      : ptyManager.getBuffer(sessionId)
    if (buffer) {
      const bufMsg: ServerTerminalMessage = { type: 'output', data: buffer }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(bufMsg))
      }
    }

    // クライアントからのメッセージ処理
    ws.on('message', (raw: Buffer) => {
      try {
        const msg: ClientTerminalMessage = JSON.parse(raw.toString())
        switch (msg.type) {
          case 'input':
            if (isRemote) {
              sshManager.write(sessionId, msg.data)
            } else {
              ptyManager.write(sessionId, msg.data)
            }
            break
          case 'resize':
            if (isRemote) {
              sshManager.resize(sessionId, msg.cols, msg.rows)
            } else {
              ptyManager.resize(sessionId, msg.cols, msg.rows)
            }
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

    ws.on('error', () => {
      clients.get(sessionId)?.delete(ws)
      if (clients.get(sessionId)?.size === 0) {
        clients.delete(sessionId)
      }
    })
  })
}

import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'
import type { PtyManager } from '../services/pty-manager.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'

/** Heartbeat間隔（30秒） */
const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * ターミナルWebSocketハンドラー
 * xterm.js ↔ PTY/SSH をWebSocketで橋渡しする
 * Heartbeat (ping/pong) で死んだ接続を早期検出する
 */
export function setupTerminalWs(
  wss: WebSocketServer,
  ptyManager: PtyManager,
  sshManager: SshManager
): void {
  // セッションID → 接続中のWebSocketクライアント群
  const clients = new Map<string, Set<WebSocket>>()
  // 各WebSocketの生存フラグ
  const aliveMap = new WeakMap<WebSocket, boolean>()

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

  // Heartbeat: 30秒ごとにpingを送り、応答がない接続を切断
  const heartbeatInterval = setInterval(() => {
    for (const [sessionId, sessionClients] of clients) {
      for (const ws of sessionClients) {
        if (!aliveMap.get(ws)) {
          // 前回のpingに応答がなかった → 死んだ接続を切断
          sessionClients.delete(ws)
          ws.terminate()
          continue
        }
        // 次のpingを送信
        aliveMap.set(ws, false)
        try {
          ws.ping()
        } catch {
          sessionClients.delete(ws)
          ws.terminate()
        }
      }
      if (sessionClients.size === 0) {
        clients.delete(sessionId)
      }
    }
  }, HEARTBEAT_INTERVAL_MS)

  // サーバー終了時にheartbeatを停止
  wss.on('close', () => {
    clearInterval(heartbeatInterval)
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

    // Heartbeat: 初期化（生存フラグをtrueに設定）
    aliveMap.set(ws, true)

    // pong応答で生存フラグを更新
    ws.on('pong', () => {
      aliveMap.set(ws, true)
    })

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

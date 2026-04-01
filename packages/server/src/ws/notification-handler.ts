import { WebSocket, WebSocketServer } from 'ws'
import type { SshManager } from '../services/ssh-manager.js'
import type { NotificationMessage } from '@kurimats/shared'

/**
 * 通知WebSocketハンドラー
 * SSH接続状態の変更やリモートClaude通知をクライアントに中継する
 */
export function setupNotificationWs(wss: WebSocketServer, sshManager: SshManager): void {
  const clients = new Set<WebSocket>()

  /**
   * 全クライアントにメッセージを送信
   */
  function broadcast(msg: NotificationMessage): void {
    const payload = JSON.stringify(msg)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload)
      }
    }
  }

  // SSH接続状態の変更を監視
  sshManager.on('connection_status', (host: string, status: 'online' | 'offline' | 'reconnecting') => {
    broadcast({ type: 'connection_status', host, status })
  })

  // リモートセッションのデータを監視してClaude通知を検出
  sshManager.on('data', (sessionId: string, data: string) => {
    // Claude Code の通知パターンを検出
    // 例: 「Claude has a question」「Waiting for input」「Task completed」などのパターン
    const notificationPatterns = [
      /🔔\s*(.+)/,
      /\[notification\]\s*(.+)/i,
      /claude.*(?:question|completed|waiting|error|finished)/i,
    ]

    for (const pattern of notificationPatterns) {
      const match = data.match(pattern)
      if (match) {
        broadcast({
          type: 'claude_notification',
          sessionId,
          message: match[1] || match[0],
          timestamp: Date.now(),
        })
        break
      }
    }
  })

  // WebSocket接続処理
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)

    // 現在の接続状態を送信
    const statuses = sshManager.getAllStatuses()
    for (const [host, status] of Object.entries(statuses)) {
      if (status !== 'offline') {
        const msg: NotificationMessage = { type: 'connection_status', host, status }
        ws.send(JSON.stringify(msg))
      }
    }

    ws.on('close', () => {
      clients.delete(ws)
    })
  })
}

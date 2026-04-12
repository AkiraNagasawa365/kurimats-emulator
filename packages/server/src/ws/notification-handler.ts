import { WebSocket, WebSocketServer } from 'ws'
import type { SshManager } from '../services/ssh-manager.js'
import type { PlaywrightRunner } from '../services/playwright-runner.js'
import type { ResourceMonitorService } from '../services/resource-monitor.js'
import type { NotificationMessage, PlaywrightRunStatus, ResourceSnapshot } from '@kurimats/shared'

/**
 * 通知WebSocketハンドラー
 * SSH接続状態の変更、リモートClaude通知、Playwright進捗、リソースメトリクスをクライアントに中継する
 *
 * @returns cleanup 関数（シャットダウン時にリスナーを解除する）
 */
export function setupNotificationWs(
  wss: WebSocketServer,
  sshManager: SshManager,
  playwrightRunner?: PlaywrightRunner,
  resourceMonitor?: ResourceMonitorService,
): () => void {
  const clients = new Set<WebSocket>()

  /**
   * 全クライアントにメッセージを送信
   */
  function broadcast(msg: NotificationMessage): void {
    const payload = JSON.stringify(msg)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload)
        } catch {
          clients.delete(ws)
          ws.terminate()
        }
      } else if (ws.readyState !== WebSocket.CONNECTING) {
        clients.delete(ws)
      }
    }
  }

  // SSH接続状態の変更を監視
  const onConnectionStatus = (host: string, status: 'online' | 'offline' | 'reconnecting') => {
    broadcast({ type: 'connection_status', host, status })
  }
  sshManager.on('connection_status', onConnectionStatus)

  // リモートセッションのデータを監視してClaude通知を検出
  const onSshData = (sessionId: string, data: string) => {
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
  }
  sshManager.on('data', onSshData)

  // Playwrightテスト進捗を監視
  const onPlaywrightProgress = (instanceId: string, status: PlaywrightRunStatus, line?: string) => {
    broadcast({
      type: 'playwright_progress',
      instanceId,
      status,
      line,
      timestamp: Date.now(),
    })
  }
  if (playwrightRunner) {
    playwrightRunner.on('progress', onPlaywrightProgress)
  }

  // リソースメトリクス変化を配信
  const onSnapshot = (snapshot: ResourceSnapshot) => {
    broadcast({ type: 'resource_update', snapshot })
  }
  if (resourceMonitor) {
    resourceMonitor.on('snapshot', onSnapshot)
  }

  // WebSocket接続処理
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)

    // 現在の接続状態を送信
    const statuses = sshManager.getAllStatuses()
    for (const [host, status] of Object.entries(statuses)) {
      if (status !== 'offline') {
        const msg: NotificationMessage = { type: 'connection_status', host, status }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg))
        }
      }
    }

    ws.on('close', () => {
      clients.delete(ws)
    })

    ws.on('error', () => {
      clients.delete(ws)
    })
  })

  // cleanup 関数: シャットダウン時にリスナーを解除
  return () => {
    sshManager.off('connection_status', onConnectionStatus)
    sshManager.off('data', onSshData)
    if (playwrightRunner) {
      playwrightRunner.off('progress', onPlaywrightProgress)
    }
    if (resourceMonitor) {
      resourceMonitor.off('snapshot', onSnapshot)
    }
    for (const ws of clients) {
      ws.close()
    }
    clients.clear()
  }
}

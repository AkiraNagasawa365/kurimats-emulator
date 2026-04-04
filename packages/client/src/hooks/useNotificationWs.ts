import { useEffect, useRef } from 'react'
import type { NotificationMessage } from '@kurimats/shared'
import { useSshStore } from '../stores/ssh-store'

/** 簡易ユニークID生成 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 通知WebSocket接続フック
 * SSH接続状態やClaude通知をリアルタイムに受信する
 */
export function useNotificationWs() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { updateConnectionStatus, addNotification } = useSshStore()

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/notifications`)
      wsRef.current = ws

      ws.onopen = () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
        }
      }

      ws.onmessage = (event) => {
        const msg: NotificationMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'connection_status':
            updateConnectionStatus(msg.host, msg.status)
            break
          case 'claude_notification':
            addNotification({
              id: generateId(),
              sessionId: msg.sessionId,
              message: msg.message,
              timestamp: msg.timestamp,
              read: false,
            })
            break
        }
      }

      ws.onclose = () => {
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [updateConnectionStatus, addNotification])
}

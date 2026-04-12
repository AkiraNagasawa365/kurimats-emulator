import { useEffect, useRef } from 'react'
import type { NotificationMessage } from '@kurimats/shared'
import { useSshStore } from '../stores/ssh-store'
import { useResourceStore } from '../stores/resource-store'

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
  const updateSnapshot = useResourceStore(s => s.updateSnapshot)

  useEffect(() => {
    let disposed = false

    function connect() {
      if (disposed) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/notifications`)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) {
          ws.close()
          return
        }
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = undefined
        }
      }

      ws.onmessage = (event) => {
        if (disposed) return
        let msg: NotificationMessage
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
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
          case 'resource_update':
            updateSnapshot(msg.snapshot)
            break
        }
      }

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimerRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = undefined
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [updateConnectionStatus, addNotification, updateSnapshot])
}

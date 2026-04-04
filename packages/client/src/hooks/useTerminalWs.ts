import { useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'

/**
 * ターミナルWebSocket接続フック
 * xterm.jsインスタンスとWebSocketを接続し、入出力を橋渡しする
 */
export function useTerminalWs(sessionId: string | null, terminal: Terminal | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const connect = useCallback(() => {
    if (!sessionId || !terminal) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      // 接続成功時、再接続タイマーをクリア
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }

    ws.onmessage = (event) => {
      const msg: ServerTerminalMessage = JSON.parse(event.data)
      switch (msg.type) {
        case 'output':
          terminal.write(msg.data)
          break
        case 'exit':
          terminal.write(`\r\n\x1b[33m[プロセス終了: コード ${msg.code}]\x1b[0m\r\n`)
          break
        case 'connected':
          // 接続確認
          break
        case 'error':
          terminal.write(`\r\n\x1b[31m[エラー: ${msg.message}]\x1b[0m\r\n`)
          break
      }
    }

    ws.onclose = () => {
      // 自動再接続（指数バックオフ）
      reconnectTimerRef.current = setTimeout(() => {
        if (sessionId && terminal) connect()
      }, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [sessionId, terminal])

  // 入力送信
  useEffect(() => {
    if (!terminal || !sessionId) return

    const disposable = terminal.onData((data) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        const msg: ClientTerminalMessage = { type: 'input', data }
        ws.send(JSON.stringify(msg))
      }
    })

    return () => disposable.dispose()
  }, [terminal, sessionId])

  // リサイズ送信
  useEffect(() => {
    if (!terminal || !sessionId) return

    const disposable = terminal.onResize(({ cols, rows }) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        const msg: ClientTerminalMessage = { type: 'resize', cols, rows }
        ws.send(JSON.stringify(msg))
      }
    })

    return () => disposable.dispose()
  }, [terminal, sessionId])

  // 接続開始/クリーンアップ
  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])
}

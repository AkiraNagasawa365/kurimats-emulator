import { useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'

/**
 * ターミナルWebSocket接続フック
 * xterm.jsインスタンスとWebSocketを接続し、入出力を橋渡しする
 *
 * 改善点:
 * - Visibility API対応: タブ復帰時にWebSocketが死んでいれば即座に再接続
 * - 再接続時のリングバッファ二重書き込み防止: terminal.reset()してから受信
 */
export function useTerminalWs(sessionId: string | null, terminal: Terminal | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const disposedRef = useRef(false)
  /** 初回接続かどうか（再接続時にターミナルをリセットするため） */
  const isFirstConnectionRef = useRef(true)

  const connect = useCallback(() => {
    if (!sessionId || !terminal || disposedRef.current) return

    // 既存のWebSocketがまだ接続中なら何もしない
    const existingWs = wsRef.current
    if (existingWs && (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING)) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (disposedRef.current) {
        ws.close()
        return
      }
      // 接続成功時、再接続タイマーをクリア
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = undefined
      }
    }

    ws.onmessage = (event) => {
      if (disposedRef.current) return
      let msg: ServerTerminalMessage
      try {
        msg = JSON.parse(event.data)
      } catch {
        terminal.write('\r\n\x1b[31m[エラー: 不正なメッセージを受信しました]\x1b[0m\r\n')
        return
      }
      switch (msg.type) {
        case 'output':
          terminal.write(msg.data)
          break
        case 'exit':
          terminal.write(`\r\n\x1b[33m[プロセス終了: コード ${msg.code}]\x1b[0m\r\n`)
          break
        case 'connected':
          // 再接続時はターミナルをリセットしてリングバッファの二重書き込みを防止
          if (!isFirstConnectionRef.current) {
            terminal.reset()
          }
          isFirstConnectionRef.current = false

          // 接続確認 → 現在のターミナルサイズを送信（PTY側の初期サイズと同期）
          if (terminal) {
            const resizeMsg: ClientTerminalMessage = { type: 'resize', cols: terminal.cols, rows: terminal.rows }
            ws.send(JSON.stringify(resizeMsg))
          }
          break
        case 'error':
          terminal.write(`\r\n\x1b[31m[エラー: ${msg.message}]\x1b[0m\r\n`)
          break
      }
    }

    ws.onclose = () => {
      if (disposedRef.current) return
      // 自動再接続（2秒後）
      reconnectTimerRef.current = setTimeout(() => {
        if (!disposedRef.current && sessionId && terminal) connect()
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
    disposedRef.current = false
    isFirstConnectionRef.current = true
    connect()

    return () => {
      disposedRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = undefined
      }
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [connect])

  // Visibility API: タブが再表示された時にWebSocketが死んでいれば即座に再接続
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !disposedRef.current) {
        const ws = wsRef.current
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          // 既存の再接続タイマーをキャンセルして即座に再接続
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = undefined
          }
          connect()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [connect])
}

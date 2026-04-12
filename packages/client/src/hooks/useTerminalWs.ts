import { useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'
import { isMacPlatform, macKeyEventToSequence } from '../utils/terminal-keybindings'

/**
 * ターミナルWebSocket接続フック
 * xterm.jsインスタンスとWebSocketを接続し、入出力を橋渡しする
 */
export function useTerminalWs(sessionId: string | null, terminal: Terminal | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const disposedRef = useRef(false)

  const connect = useCallback(() => {
    if (!sessionId || !terminal || disposedRef.current) return

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
      // 別の接続が既に確立されている場合は再接続しない（stale closure防止）
      if (ws !== wsRef.current) return
      // 自動再接続（指数バックオフ）
      reconnectTimerRef.current = setTimeout(() => {
        if (!disposedRef.current && sessionId && terminal) connect()
      }, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [sessionId, terminal])

  // 入力送信ヘルパー（onDataとキーバインドハンドラの両方から使う）
  const sendInput = useCallback((data: string) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientTerminalMessage = { type: 'input', data }
      ws.send(JSON.stringify(msg))
    }
  }, [])

  // 入力送信
  useEffect(() => {
    if (!terminal || !sessionId) return

    const disposable = terminal.onData(sendInput)

    return () => disposable.dispose()
  }, [terminal, sessionId, sendInput])

  // mac風キーバインド（Cmd/Opt + Backspace/矢印）をPTY制御シーケンスに変換
  // xterm.jsはmetaKey付きキーをブラウザに委ねるためデフォルトではPTYに届かない。
  // attachCustomKeyEventHandlerで該当キーを拾い、sendInput経由で直接送信する。
  useEffect(() => {
    if (!terminal) return
    const isMac = isMacPlatform()

    terminal.attachCustomKeyEventHandler((event) => {
      const seq = macKeyEventToSequence(event, isMac)
      if (seq === null) return true // 対象外キーはxtermのデフォルト処理に委ねる
      event.preventDefault()
      sendInput(seq)
      return false // xtermの以後の処理を抑制
    })

    return () => {
      // クリーンアップ時はno-opハンドラに戻す（dispose前の二重処理防止）
      terminal.attachCustomKeyEventHandler(() => true)
    }
  }, [terminal, sendInput])

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
}

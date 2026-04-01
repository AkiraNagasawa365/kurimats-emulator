import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalWs } from '../../hooks/useTerminalWs'

interface Props {
  sessionId: string
  isActive: boolean
  onFocus?: () => void
}

/**
 * xterm.jsターミナルコンポーネント
 * WebSocket経由でサーバーのPTYに接続する
 */
export function TerminalComponent({ sessionId, isActive, onFocus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [terminal, setTerminal] = useState<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  // xterm.jsインスタンスの作成
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Menlo', monospace",
      cursorBlink: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(containerRef.current)
    fitAddon.fit()
    fitAddonRef.current = fitAddon

    setTerminal(term)

    // リサイズ監視
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // コンテナが非表示の場合は無視
        }
      })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      setTerminal(null)
    }
  }, [])

  // WebSocket接続
  useTerminalWs(sessionId, terminal)

  // アクティブ時にフォーカス
  useEffect(() => {
    if (isActive && terminal) {
      terminal.focus()
    }
  }, [isActive, terminal])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onClick={onFocus}
    />
  )
}

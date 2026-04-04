import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalWs } from '../../hooks/useTerminalWs'
import { hasValidSize, safeFit } from '../../utils/terminal-utils'

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

    const container = containerRef.current
    let disposed = false

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
    fitAddonRef.current = fitAddon

    let initObserver: ResizeObserver | null = null

    /**
     * ターミナルの初期化を実行する
     * open()はコンテナサイズが0だと内部のrenderServiceが未初期化となり
     * syncScrollAreaでdimensionsエラーが発生する。
     * さらにopen()内部でも同期的にsyncScrollAreaが呼ばれるため、
     * requestAnimationFrameで次フレームに遅延させ、DOMレイアウト確定後に実行する。
     */
    const initTerminal = () => {
      requestAnimationFrame(() => {
        if (disposed) return
        if (!hasValidSize(container)) return
        try {
          term.open(container)
        } catch {
          // xterm.js内部のdimensionsエラーをキャッチ（初回open時の既知の問題）
          return
        }
        safeFit(fitAddon, container)
        setTerminal(term)
      })
    }

    // コンテナサイズが有効ならすぐ初期化、そうでなければサイズ確定を待つ
    if (hasValidSize(container)) {
      initTerminal()
    } else {
      // サイズが0の場合、ResizeObserverでサイズ確定を検知してから初期化
      initObserver = new ResizeObserver(() => {
        if (hasValidSize(container)) {
          initObserver?.disconnect()
          initObserver = null
          initTerminal()
        }
      })
      initObserver.observe(container)
    }

    // リサイズ監視（サイズが有効な場合のみfit）
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        safeFit(fitAddon, container)
      })
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      initObserver?.disconnect()
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
      className="w-full h-full nopan nodrag nowheel"
      style={{ contain: 'strict' }}
      onClick={() => { onFocus?.(); terminal?.focus() }}
    />
  )
}

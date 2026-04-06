import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalWs } from '../../hooks/useTerminalWs'
import { hasValidSize, safeFit, getCellDimensions } from '../../utils/terminal-utils'
import { useShellStateStore } from '../../stores/shell-state-store'
import { useSshStore } from '../../stores/ssh-store'

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
      fontFamily: "'Cascadia Code', 'Fira Code', 'Source Han Code JP', 'Noto Sans Mono CJK JP', 'Menlo', monospace",
      cursorBlink: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const unicode11Addon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank')
    })
    term.loadAddon(fitAddon)
    term.loadAddon(unicode11Addon)
    term.unicode.activeVersion = '11'
    term.loadAddon(webLinksAddon)
    fitAddonRef.current = fitAddon

    /**
     * IntersectionObserverでコンテナが画面に表示されたことを検出してから初期化
     * - requestAnimationFrameでは1フレーム遅延が不十分な場合がある
     * - IntersectionObserverは要素が実際にビューポートに表示された時点で発火するため確実
     * - 非アクティブタブのターミナルは表示時まで初期化を遅延（リソース削減）
     */
    const initObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || disposed) return
        if (!hasValidSize(container)) return

        initObserver.disconnect()
        try {
          term.open(container)
        } catch (e) {
          console.warn('xterm.js open()エラー:', e)
          return
        }
        safeFit(fitAddon, container)
        setTerminal(term)
      },
      { threshold: 0.01 },
    )

    initObserver.observe(container)

    // リサイズ監視（サイズが有効な場合のみfit）
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        safeFit(fitAddon, container)
      })
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      initObserver.disconnect()
      resizeObserver.disconnect()
      term.dispose()
      setTerminal(null)
    }
  }, [])

  // IME変換候補ウィンドウの位置をカーソルに同期
  useEffect(() => {
    if (!terminal || !containerRef.current) return

    const container = containerRef.current
    const disposable = terminal.onCursorMove(() => {
      const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
      if (!textarea) return

      const cell = getCellDimensions(terminal)
      if (!cell) return

      const cursorCol = terminal.buffer.active.cursorX
      const cursorRow = terminal.buffer.active.cursorY - terminal.buffer.active.viewportY
      textarea.style.left = `${cursorCol * cell.width}px`
      textarea.style.top = `${cursorRow * cell.height}px`
      textarea.style.width = `${cell.width}px`
      textarea.style.height = `${cell.height}px`
      textarea.style.fontSize = `${terminal.options.fontSize}px`
      textarea.style.lineHeight = 'normal'
    })

    return () => disposable.dispose()
  }, [terminal])

  // OSC 133 シェル統合ハンドラー
  const commandStartTimeRef = useRef<number | null>(null)
  /** コマンド完了通知の閾値（この秒数以上実行していたコマンドの完了を通知） */
  const NOTIFY_THRESHOLD_MS = 5000

  useEffect(() => {
    if (!terminal) return

    const { markCommandStart, markCommandFinish } = useShellStateStore.getState()
    const { addNotification } = useSshStore.getState()

    // OSC 133 ハンドラー登録
    // データ形式: "A", "B", "C", "D;exitCode"
    const disposable = terminal.parser.registerOscHandler(133, (data) => {
      const marker = data.charAt(0)
      switch (marker) {
        case 'C': // コマンド実行開始
          commandStartTimeRef.current = Date.now()
          markCommandStart(sessionId)
          break
        case 'D': { // コマンド完了
          const exitCodeStr = data.substring(2) // "D;0" → "0"
          const exitCode = parseInt(exitCodeStr, 10)
          const finalExitCode = isNaN(exitCode) ? 0 : exitCode
          markCommandFinish(sessionId, finalExitCode)

          // 長時間実行コマンドの完了を通知
          const startTime = commandStartTimeRef.current
          if (startTime && Date.now() - startTime >= NOTIFY_THRESHOLD_MS) {
            const status = finalExitCode === 0 ? '成功' : `失敗 (code: ${finalExitCode})`
            addNotification({
              id: `cmd-${sessionId}-${Date.now()}`,
              sessionId,
              message: `コマンド完了: ${status}`,
              timestamp: Date.now(),
              read: false,
            })
          }
          commandStartTimeRef.current = null
          break
        }
        // A（プロンプト開始）, B（入力開始）は将来のPhase 3/4で使用
      }
      return false // XTerm.jsのデフォルト処理も継続
    })

    return () => {
      disposable.dispose()
    }
  }, [terminal, sessionId])

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

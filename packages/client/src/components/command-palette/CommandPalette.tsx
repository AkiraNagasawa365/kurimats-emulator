import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCommandPaletteStore, type Command } from '../../stores/command-palette-store'
import { useSessionStore } from '../../stores/session-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useOverlayStore } from '../../stores/overlay-store'
import type { LayoutMode } from '@kurimats/shared'

/**
 * コマンドパレット
 * Ctrl+Shift+P / Ctrl+K で開く
 * コマンド検索・実行
 */
export function CommandPalette() {
  const { search, setSearch, close } = useCommandPaletteStore()
  const { sessions } = useSessionStore()
  const { setMode, addPanel, setActivePanel, panels } = useLayoutStore()
  const { openOverlay } = useOverlayStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // コマンド一覧の構築
  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      // レイアウトコマンド
      { id: 'layout-1x1', label: 'レイアウト: 1列', shortcut: '', category: 'レイアウト', action: () => { setMode('1x1' as LayoutMode); close() } },
      { id: 'layout-2x1', label: 'レイアウト: 2列', shortcut: '', category: 'レイアウト', action: () => { setMode('2x1' as LayoutMode); close() } },
      { id: 'layout-1x2', label: 'レイアウト: 2段', shortcut: '', category: 'レイアウト', action: () => { setMode('1x2' as LayoutMode); close() } },
      { id: 'layout-2x2', label: 'レイアウト: 4分割', shortcut: '', category: 'レイアウト', action: () => { setMode('2x2' as LayoutMode); close() } },
      { id: 'layout-3x1', label: 'レイアウト: 3列', shortcut: '', category: 'レイアウト', action: () => { setMode('3x1' as LayoutMode); close() } },
      // オーバーレイコマンド
      { id: 'file-tree', label: 'ファイルツリーを開く', shortcut: '⌘E', category: 'ツール', action: () => { openOverlay('file-tree'); close() } },
      { id: 'markdown', label: 'Markdownプレビュー', shortcut: '⌘M', category: 'ツール', action: () => { openOverlay('markdown'); close() } },
    ]

    // セッションコマンド
    sessions.forEach(session => {
      const panelIndex = panels.findIndex(p => p.sessionId === session.id)
      const isInPanel = panelIndex >= 0

      cmds.push({
        id: `session-${session.id}`,
        label: `セッションに移動: ${session.name}`,
        shortcut: '',
        category: 'セッション',
        action: () => {
          if (isInPanel) {
            setActivePanel(panelIndex)
          } else {
            addPanel(session.id)
          }
          close()
        },
      })
    })

    return cmds
  }, [sessions, panels, setMode, openOverlay, close, setActivePanel, addPanel])

  // 検索フィルタ
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands
    const query = search.toLowerCase()
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
    )
  }, [commands, search])

  // 選択インデックスのリセット
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // 初期フォーカス
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 選択項目のスクロール追従
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.children[selectedIndex] as HTMLElement
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
      }
    } else if (e.key === 'Escape') {
      close()
    }
  }

  // テキストハイライト
  const highlightMatch = (text: string) => {
    if (!search.trim()) return text
    const query = search.toLowerCase()
    const idx = text.toLowerCase().indexOf(query)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-accent font-semibold">{text.slice(idx, idx + search.length)}</span>
        {text.slice(idx + search.length)}
      </>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-center pt-[15vh] animate-fade-in"
      onClick={close}
    >
      {/* 背景オーバーレイ */}
      <div className="absolute inset-0 bg-black/10" />

      {/* パレット本体 */}
      <div
        className="relative w-full max-w-[600px] bg-white rounded-lg shadow-2xl border border-border overflow-hidden animate-slide-down"
        style={{ maxHeight: '60vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 検索入力 */}
        <div className="flex items-center px-4 py-3 border-b border-border">
          <span className="text-text-secondary mr-2">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="コマンドを検索..."
            className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder-text-muted"
          />
        </div>

        {/* コマンドリスト */}
        <div ref={listRef} className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(60vh - 52px)' }}>
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-muted text-sm">
              一致するコマンドがありません
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => cmd.action()}
                className={`w-full text-left px-4 py-2 flex items-center justify-between text-sm transition-colors ${
                  idx === selectedIndex
                    ? 'bg-accent-light text-text-primary'
                    : 'text-text-primary hover:bg-surface-2'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-text-muted text-xs">{cmd.category}</span>
                  <span className="truncate">{highlightMatch(cmd.label)}</span>
                </div>
                {cmd.shortcut && (
                  <span className="text-xs text-text-muted ml-4 flex-shrink-0 bg-surface-2 px-1.5 py-0.5 rounded">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

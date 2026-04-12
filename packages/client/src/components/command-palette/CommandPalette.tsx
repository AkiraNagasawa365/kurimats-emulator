import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCommandPaletteStore, type Command } from '../../stores/command-palette-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { usePaneStore } from '../../stores/pane-store'
import { useOverlayStore } from '../../stores/overlay-store'

/**
 * コマンドパレット（cmux v3）
 * Cmd+Shift+P で開く
 * ペイン/ワークスペース/サーフェス操作をファジー検索
 */
export function CommandPalette() {
  const { search, setSearch, close } = useCommandPaletteStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { workspaces, workspaceOrder, switchWorkspace, activeWorkspaceId } = useWorkspaceStore()
  const { splitPane, closePane, toggleZoom, focusDirection } = usePaneStore()
  const { openOverlay } = useOverlayStore()

  // アクティブワークスペース
  const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
  const activePaneId = activeWs?.activePaneId ?? ''

  // コマンド一覧の構築
  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = []

    // ペインコマンド
    cmds.push(
      { id: 'pane-split-v', label: '縦に分割', shortcut: '⌘D', category: 'ペイン', action: () => { splitPane(activePaneId, 'vertical'); close() } },
      { id: 'pane-split-h', label: '横に分割', shortcut: '⌘⇧D', category: 'ペイン', action: () => { splitPane(activePaneId, 'horizontal'); close() } },
      { id: 'pane-close', label: 'ペインを閉じる', shortcut: '⌘W', category: 'ペイン', action: () => { closePane(activePaneId); close() } },
      { id: 'pane-zoom', label: 'ズーム切替', shortcut: '⌘⇧↩', category: 'ペイン', action: () => { toggleZoom(activePaneId); close() } },
      { id: 'pane-focus-left', label: '左のペインへ移動', shortcut: '⌘⌥←', category: 'ナビゲーション', action: () => { focusDirection('left'); close() } },
      { id: 'pane-focus-right', label: '右のペインへ移動', shortcut: '⌘⌥→', category: 'ナビゲーション', action: () => { focusDirection('right'); close() } },
      { id: 'pane-focus-up', label: '上のペインへ移動', shortcut: '⌘⌥↑', category: 'ナビゲーション', action: () => { focusDirection('up'); close() } },
      { id: 'pane-focus-down', label: '下のペインへ移動', shortcut: '⌘⌥↓', category: 'ナビゲーション', action: () => { focusDirection('down'); close() } },
    )

    // オーバーレイコマンド
    cmds.push(
      { id: 'overlay-filetree', label: 'ファイルツリーを開く', shortcut: '⌘⇧E', category: 'ファイル', action: () => { openOverlay('file-tree'); close() } },
      { id: 'overlay-markdown', label: 'Markdownプレビューを開く', shortcut: '⌘⇧M', category: 'ファイル', action: () => { openOverlay('markdown'); close() } },
    )

    // ワークスペースコマンド
    cmds.push(
      { id: 'ws-new', label: '新規ワークスペース', shortcut: '⌘N', category: 'ワークスペース', action: () => { window.dispatchEvent(new CustomEvent('create-workspace')); close() } },
    )

    // ワークスペース切替コマンド
    workspaceOrder.forEach((wsId, index) => {
      const ws = workspaces.find(w => w.id === wsId)
      if (!ws) return
      cmds.push({
        id: `ws-switch-${wsId}`,
        label: `切替: ${ws.name}`,
        shortcut: index < 9 ? `⌘${index + 1}` : '',
        category: 'ワークスペース',
        action: () => { switchWorkspace(wsId); close() },
      })
    })

    return cmds
  }, [activePaneId, workspaces, workspaceOrder, splitPane, closePane, toggleZoom, focusDirection, switchWorkspace, openOverlay, close])

  // 検索フィルタ
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands
    const query = search.toLowerCase()
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query),
    )
  }, [commands, search])

  // 選択インデックスのリセット
  useEffect(() => { setSelectedIndex(0) }, [search])

  // 初期フォーカス
  useEffect(() => { inputRef.current?.focus() }, [])

  // 選択項目のスクロール追従
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.children[selectedIndex] as HTMLElement
    if (selected) selected.scrollIntoView({ block: 'nearest' })
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
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative w-full max-w-[600px] bg-chrome rounded-lg shadow-2xl border border-border overflow-hidden animate-slide-down"
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
                  <span className="text-text-muted text-xs w-20 flex-shrink-0">{cmd.category}</span>
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
    document.body,
  )
}

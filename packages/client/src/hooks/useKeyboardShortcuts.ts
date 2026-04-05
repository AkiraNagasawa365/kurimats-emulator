import { useEffect } from 'react'
import { useCommandPaletteStore } from '../stores/command-palette-store'
import { usePaneStore } from '../stores/pane-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useOverlayStore } from '../stores/overlay-store'

/**
 * cmux型キーボードショートカット
 */
export function useKeyboardShortcuts() {
  const { open: openPalette } = useCommandPaletteStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Escape → アンズーム or コマンドパレット閉じる
      if (e.key === 'Escape') {
        const paneStore = usePaneStore.getState()
        if (paneStore.zoomedPaneId) {
          paneStore.unzoom()
          return
        }
        useCommandPaletteStore.getState().close()
        return
      }

      // コマンドパレットが開いている場合はショートカットを無効化
      if (useCommandPaletteStore.getState().isOpen) return

      // ターミナルにフォーカスがある場合、ペイン操作キーのみ処理
      const activeEl = document.activeElement
      const isTerminalFocused = activeEl?.closest('.xterm') != null

      // --- グローバルショートカット ---

      // Cmd+Shift+P → コマンドパレット
      if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        openPalette()
        return
      }

      // Cmd+Shift+E → ファイルツリーオーバーレイ
      if (meta && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        const overlay = useOverlayStore.getState()
        if (overlay.activeOverlay === 'file-tree') {
          overlay.closeOverlay()
        } else {
          overlay.openOverlay('file-tree')
        }
        return
      }

      // Cmd+Shift+M → Markdownプレビューオーバーレイ
      if (meta && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        const overlay = useOverlayStore.getState()
        if (overlay.activeOverlay === 'markdown') {
          overlay.closeOverlay()
        } else {
          overlay.openOverlay('markdown')
        }
        return
      }

      // Cmd+D → 縦分割
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const ws = useWorkspaceStore.getState()
        const workspace = ws.workspaces.find(w => w.id === ws.activeWorkspaceId)
        if (workspace) {
          usePaneStore.getState().splitPane(workspace.activePaneId, 'vertical')
        }
        return
      }

      // Cmd+Shift+D → 横分割
      if (meta && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const ws = useWorkspaceStore.getState()
        const workspace = ws.workspaces.find(w => w.id === ws.activeWorkspaceId)
        if (workspace) {
          usePaneStore.getState().splitPane(workspace.activePaneId, 'horizontal')
        }
        return
      }

      // Cmd+Shift+Enter → ペインズーム切替
      if (meta && e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        const ws = useWorkspaceStore.getState()
        const workspace = ws.workspaces.find(w => w.id === ws.activeWorkspaceId)
        if (workspace) {
          usePaneStore.getState().toggleZoom(workspace.activePaneId)
        }
        return
      }

      // Cmd+W → ペインを閉じる
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        const ws = useWorkspaceStore.getState()
        const workspace = ws.workspaces.find(w => w.id === ws.activeWorkspaceId)
        if (workspace) {
          usePaneStore.getState().closePane(workspace.activePaneId)
        }
        return
      }

      // Cmd+N → 新規ワークスペース
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('create-workspace'))
        return
      }

      // Cmd+1-9 → ワークスペース切替
      if (meta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const ws = useWorkspaceStore.getState()
        const index = parseInt(e.key) - 1
        if (index < ws.workspaceOrder.length) {
          ws.switchWorkspace(ws.workspaceOrder[index])
        }
        return
      }

      // ターミナルにフォーカス中はここで終了（以下のキーはターミナルに渡す）
      if (isTerminalFocused) return

      // Cmd+Alt+矢印 → ペイン間フォーカス移動
      if (meta && e.altKey) {
        const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        }
        const direction = dirMap[e.key]
        if (direction) {
          e.preventDefault()
          usePaneStore.getState().focusDirection(direction)
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openPalette])
}

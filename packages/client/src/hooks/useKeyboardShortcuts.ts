import { useEffect } from 'react'
import { useCommandPaletteStore } from '../stores/command-palette-store'
import { useOverlayStore } from '../stores/overlay-store'

export function useKeyboardShortcuts() {
  const { open: openPalette } = useCommandPaletteStore()
  const { openOverlay, closeOverlay, activeOverlay } = useOverlayStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape → オーバーレイ/パレット閉じる
      if (e.key === 'Escape') {
        closeOverlay()
        useCommandPaletteStore.getState().close()
        return
      }

      // コマンドパレットが開いている場合はショートカットを無効化
      if (useCommandPaletteStore.getState().isOpen) return
      // オーバーレイが開いている場合も無効化
      if (activeOverlay) return

      // Ctrl/Cmd+Shift+P → コマンドパレット
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault()
        openPalette()
        return
      }

      // Ctrl/Cmd+K → 検索（コマンドパレットを検索モードで開く）
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        openPalette()
        return
      }

      // Ctrl/Cmd+E → ファイルツリー
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        openOverlay('file-tree')
        return
      }

      // Ctrl/Cmd+M → Markdownプレビュー
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        openOverlay('markdown')
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openPalette, openOverlay, closeOverlay, activeOverlay])
}

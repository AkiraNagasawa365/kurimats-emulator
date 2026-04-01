import { useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { PanelContainer } from './components/layout/PanelContainer'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { FileTreeOverlay } from './components/overlays/FileTreeOverlay'
import { CodeViewerOverlay } from './components/overlays/CodeViewerOverlay'
import { MarkdownOverlay } from './components/overlays/MarkdownOverlay'
import { useSessionStore } from './stores/session-store'
import { useOverlayStore } from './stores/overlay-store'
import { useCommandPaletteStore } from './stores/command-palette-store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App() {
  const { fetchSessions, fetchProjects } = useSessionStore()
  const { activeOverlay, closeOverlay, overlayProps } = useOverlayStore()
  const { isOpen: isPaletteOpen } = useCommandPaletteStore()

  useKeyboardShortcuts()

  useEffect(() => {
    fetchSessions()
    fetchProjects()
  }, [fetchSessions, fetchProjects])

  return (
    <div className="h-screen flex flex-col bg-white text-text-primary">
      {/* メインエリア: サイドバー + パネル */}
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <PanelContainer />
        </div>
      </div>

      {/* ステータスバー */}
      <StatusBar />

      {/* コマンドパレット */}
      {isPaletteOpen && <CommandPalette />}

      {/* オーバーレイ */}
      {activeOverlay === 'file-tree' && (
        <FileTreeOverlay onClose={closeOverlay} />
      )}
      {activeOverlay === 'code-viewer' && (
        <CodeViewerOverlay
          filePath={overlayProps.filePath as string}
          onClose={closeOverlay}
        />
      )}
      {activeOverlay === 'markdown' && (
        <MarkdownOverlay
          filePath={overlayProps.filePath as string | undefined}
          onClose={closeOverlay}
        />
      )}
    </div>
  )
}

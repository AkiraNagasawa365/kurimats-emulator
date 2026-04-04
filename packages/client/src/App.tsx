import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Sidebar } from './components/layout/Sidebar'
import { BoardCanvas } from './components/board/BoardCanvas'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { FileTreeOverlay } from './components/overlays/FileTreeOverlay'
import { CodeViewerOverlay } from './components/overlays/CodeViewerOverlay'
import { MarkdownOverlay } from './components/overlays/MarkdownOverlay'
import { NotificationToast } from './components/notifications/NotificationToast'
import { FeedbackPanel } from './components/feedback/FeedbackPanel'
import { useSessionStore } from './stores/session-store'
import { useOverlayStore } from './stores/overlay-store'
import { useCommandPaletteStore } from './stores/command-palette-store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useLayoutStore } from './stores/layout-store'
import { useNotificationWs } from './hooks/useNotificationWs'

export default function App() {
  const { fetchSessions, fetchProjects } = useSessionStore()
  const { activeOverlay, closeOverlay, overlayProps } = useOverlayStore()
  const { isOpen: isPaletteOpen } = useCommandPaletteStore()
  const { loadSavedLayout } = useLayoutStore()

  useKeyboardShortcuts()
  useNotificationWs()

  useEffect(() => {
    fetchSessions()
    fetchProjects()
    loadSavedLayout()
  }, [fetchSessions, fetchProjects, loadSavedLayout])

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-text-primary">
      {/* メインエリア: サイドバー + ボードキャンバス */}
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 min-w-0 relative">
          <ReactFlowProvider>
            <BoardCanvas />
          </ReactFlowProvider>
        </div>
      </div>

      {/* ステータスバー */}
      <StatusBar />

      {/* コマンドパレット */}
      {isPaletteOpen && <CommandPalette />}

      {/* オーバーレイ */}
      {activeOverlay === 'file-tree' && (
        <FileTreeOverlay onClose={closeOverlay} sessionId={overlayProps.sessionId as string | undefined} />
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
          fullScreen={overlayProps.fullScreen as boolean | undefined}
          onClose={closeOverlay}
        />
      )}
      {activeOverlay === 'feedback' && (
        <FeedbackPanel onClose={closeOverlay} />
      )}

      {/* 通知トースト */}
      <NotificationToast />
    </div>
  )
}

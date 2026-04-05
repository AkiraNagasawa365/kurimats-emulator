import { useOverlayStore } from '../../stores/overlay-store'
import { FileTreeOverlay } from './FileTreeOverlay'
import { MarkdownOverlay } from './MarkdownOverlay'
import { CodeViewerOverlay } from './CodeViewerOverlay'

/**
 * オーバーレイレンダラー
 * overlay-store の activeOverlay に応じて対応オーバーレイを描画
 */
export function OverlayRenderer() {
  const { activeOverlay, overlayProps, closeOverlay } = useOverlayStore()

  if (!activeOverlay) return null

  switch (activeOverlay) {
    case 'file-tree':
      return (
        <FileTreeOverlay
          onClose={closeOverlay}
          sessionId={overlayProps.sessionId as string | undefined}
        />
      )
    case 'markdown':
      return (
        <MarkdownOverlay
          onClose={closeOverlay}
          filePath={overlayProps.filePath as string | undefined}
          fullScreen={overlayProps.fullScreen as boolean | undefined}
        />
      )
    case 'code-viewer':
      return (
        <CodeViewerOverlay
          filePath={overlayProps.filePath as string}
          onClose={closeOverlay}
        />
      )
    default:
      return null
  }
}

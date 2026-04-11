import { useOverlayStore } from '../../stores/overlay-store'
import { FileTreeOverlay } from './FileTreeOverlay'
import { MarkdownOverlay } from './MarkdownOverlay'
import { CodeViewerOverlay } from './CodeViewerOverlay'
import { FeedbackPanel } from '../feedback/FeedbackPanel'

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
        />
      )
    case 'markdown':
      return (
        <MarkdownOverlay
          onClose={closeOverlay}
          filePath={overlayProps.filePath as string | undefined}
          fullScreen={overlayProps.fullScreen as boolean | undefined}
          sshHost={overlayProps.sshHost as string | null | undefined}
        />
      )
    case 'code-viewer':
      return (
        <CodeViewerOverlay
          filePath={overlayProps.filePath as string}
          onClose={closeOverlay}
          sshHost={overlayProps.sshHost as string | null | undefined}
        />
      )
    case 'feedback':
      return <FeedbackPanel onClose={closeOverlay} />
    default:
      return null
  }
}

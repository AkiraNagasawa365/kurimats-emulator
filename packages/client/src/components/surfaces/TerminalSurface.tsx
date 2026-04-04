import { useCallback } from 'react'
import { TerminalComponent } from '../terminal/Terminal'
import { usePaneStore } from '../../stores/pane-store'
import { useWorkspaceStore } from '../../stores/workspace-store'

interface TerminalSurfaceProps {
  sessionId: string
  paneId: string
}

/**
 * ターミナルサーフェス
 * 既存のTerminalComponentをペインシステム向けにラップする
 */
export function TerminalSurface({ sessionId, paneId }: TerminalSurfaceProps) {
  const focusPane = usePaneStore(s => s.focusPane)
  const activeWorkspace = useWorkspaceStore(s =>
    s.workspaces.find(w => w.id === s.activeWorkspaceId),
  )

  const isActive = activeWorkspace?.activePaneId === paneId

  const handleFocus = useCallback(() => {
    focusPane(paneId)
  }, [paneId, focusPane])

  return (
    <div className="w-full h-full">
      <TerminalComponent
        sessionId={sessionId}
        isActive={isActive}
        onFocus={handleFocus}
      />
    </div>
  )
}

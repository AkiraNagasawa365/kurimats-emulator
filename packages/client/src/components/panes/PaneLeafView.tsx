import { useCallback } from 'react'
import type { PaneLeaf } from '@kurimats/shared'
import { usePaneStore } from '../../stores/pane-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useSessionStore } from '../../stores/session-store'
import { PaneToolbar } from './PaneToolbar'
import { TerminalSurface } from '../surfaces/TerminalSurface'

interface PaneLeafViewProps {
  leaf: PaneLeaf
}

/**
 * ペインリーフ表示
 * 1ペイン = 1セッション（ターミナル）
 */
export function PaneLeafView({ leaf }: PaneLeafViewProps) {
  const focusPane = usePaneStore(s => s.focusPane)
  const attentionRings = usePaneStore(s => s.attentionRings)
  const activeWorkspace = useWorkspaceStore(s => {
    const ws = s.workspaces.find(w => w.id === s.activeWorkspaceId)
    return ws
  })

  const isActive = activeWorkspace?.activePaneId === leaf.id
  const hasAttention = attentionRings.get(leaf.id) ?? false

  const sessions = useSessionStore(s => s.sessions)
  const session = sessions.find(s => s.id === leaf.sessionId) ?? null

  const handleClick = useCallback(() => {
    if (!isActive) focusPane(leaf.id)
  }, [isActive, leaf.id, focusPane])

  return (
    <div
      className={`
        w-full h-full flex flex-col bg-surface-0 border
        ${isActive ? 'border-accent' : 'border-border'}
        ${hasAttention ? 'pane-attention-ring' : ''}
      `}
      onClick={handleClick}
    >
      {/* ペインツールバー */}
      {session && (
        <PaneToolbar session={session} paneId={leaf.id} />
      )}

      {/* ターミナル */}
      <div className="flex-1 overflow-hidden">
        <TerminalSurface sessionId={leaf.sessionId} paneId={leaf.id} />
      </div>
    </div>
  )
}

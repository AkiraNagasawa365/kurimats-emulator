import { useCallback } from 'react'
import type { PaneLeaf } from '@kurimats/shared'
import { usePaneStore } from '../../stores/pane-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useSessionStore } from '../../stores/session-store'
import { SurfaceTabs } from './SurfaceTabs'
import { PaneToolbar } from './PaneToolbar'
import { TerminalSurface } from '../surfaces/TerminalSurface'
import { BrowserSurface } from '../surfaces/BrowserSurface'
import { EditorSurface } from '../surfaces/EditorSurface'
import { MarkdownSurface } from '../surfaces/MarkdownSurface'

interface PaneLeafViewProps {
  leaf: PaneLeaf
}

/**
 * ペインリーフ表示
 * サーフェスタブ + コンテンツ + 通知リング + アクティブボーダー
 */
export function PaneLeafView({ leaf }: PaneLeafViewProps) {
  const focusPane = usePaneStore(s => s.focusPane)
  const attentionRings = usePaneStore(s => s.attentionRings)
  const activeWorkspace = useWorkspaceStore(s => {
    const ws = s.workspaces.find(w => w.id === s.activeWorkspaceId)
    return ws
  })

  const session = useSessionStore(s => {
    const termSurface = leaf.surfaces.find(sf => sf.type === 'terminal')
    return termSurface ? s.sessions.find(sess => sess.id === termSurface.target) : undefined
  })

  const isActive = activeWorkspace?.activePaneId === leaf.id
  const hasAttention = attentionRings.get(leaf.id) ?? false

  const sessions = useSessionStore(s => s.sessions)

  const handleClick = useCallback(() => {
    if (!isActive) focusPane(leaf.id)
  }, [isActive, leaf.id, focusPane])

  const activeSurface = leaf.surfaces[leaf.activeSurfaceIndex]

  // ターミナルサーフェスの場合、対応するセッション情報を取得
  const sessionId = activeSurface?.type === 'terminal' ? activeSurface.target : null
  const session = sessionId ? sessions.find(s => s.id === sessionId) : null

  // 空のペイン表示
  if (!activeSurface) {
    return (
      <div
        className={`
          w-full h-full flex flex-col bg-surface-0 border
          ${isActive ? 'border-accent' : 'border-border'}
          ${hasAttention ? 'pane-attention-ring' : ''}
        `}
        onClick={handleClick}
      >
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
          <div className="text-center">
            <p className="mb-2">空のペイン</p>
            <p className="text-xs text-text-muted">
              Cmd+Shift+P でコマンドパレットを開く
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`
        w-full h-full flex flex-col bg-surface-0 border
        ${isActive ? 'border-accent' : 'border-border'}
        ${hasAttention ? 'pane-attention-ring' : ''}
      `}
      onClick={handleClick}
    >
      {/* ペインツールバー（ターミナルセッション時のみ） */}
      {session && (
        <PaneToolbar session={session} paneId={leaf.id} />
      )}

      {/* サーフェスタブバー */}
      <SurfaceTabs
        paneId={leaf.id}
        surfaces={leaf.surfaces}
        activeSurfaceIndex={leaf.activeSurfaceIndex}
      />

      {/* ターミナルヘッダー（セッション名＋ブランチ） */}
      {session && (
        <div className={`flex items-center justify-between px-3 py-1 text-xs border-b flex-shrink-0 ${
          isActive ? 'bg-tile-header border-accent' : 'bg-tile-header border-border'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              session.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
            }`} />
            <span className="truncate font-medium text-text-primary">{session.name}</span>
            {session.branch && (
              <span className="text-text-muted truncate">[{session.branch}]</span>
            )}
          </div>
        </div>
      )}

      {/* サーフェスコンテンツ */}
      <div className="flex-1 overflow-hidden">
        <SurfaceContent surface={activeSurface} paneId={leaf.id} />
      </div>
    </div>
  )
}

/** サーフェスタイプに応じたコンテンツレンダリング */
function SurfaceContent({ surface, paneId }: { surface: PaneLeaf['surfaces'][0]; paneId: string }) {
  switch (surface.type) {
    case 'terminal':
      return <TerminalSurface sessionId={surface.target} paneId={paneId} />
    case 'browser':
      return <BrowserSurface url={surface.target} />
    case 'editor':
      return <EditorSurface filePath={surface.target} />
    case 'markdown':
      return <MarkdownSurface filePath={surface.target} />
    default:
      return <div className="p-4 text-text-muted">不明なサーフェスタイプ</div>
  }
}

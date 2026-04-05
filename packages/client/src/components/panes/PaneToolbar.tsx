import { useCallback } from 'react'
import type { Session } from '@kurimats/shared'
import { useSessionStore } from '../../stores/session-store'
import { usePaneStore } from '../../stores/pane-store'
import { AnimatedFavoriteButton } from '../animations/FavoriteAnimations'

interface PaneToolbarProps {
  session: Session
  paneId: string
}

/**
 * ペイン上部のツールバー
 * セッション名・ブランチ表示 + お気に入り★ + コード表示ボタン
 */
export function PaneToolbar({ session, paneId }: PaneToolbarProps) {
  const toggleFavorite = useSessionStore(s => s.toggleFavorite)
  const addSurface = usePaneStore(s => s.addSurface)

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(session.id)
  }, [toggleFavorite, session.id])

  const handleOpenCode = useCallback(() => {
    // セッションのrepoPathをエディタサーフェスとして開く
    const target = session.worktreePath || session.repoPath
    addSurface(paneId, {
      id: `editor-${session.id}-${Date.now()}`,
      type: 'editor',
      target,
      label: session.branch ? `📂 ${session.branch}` : '📂 コード',
    })
  }, [addSurface, paneId, session])

  return (
    <div className="group flex items-center gap-1 bg-surface-1 border-b border-border px-2 h-6 flex-shrink-0">
      {/* ステータスインジケータ */}
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        session.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
      }`} />

      {/* セッション名 */}
      <span className="text-xs text-text-secondary truncate">
        {session.name}
      </span>

      {/* ブランチ名 */}
      {session.branch && (
        <span className="text-xs text-text-muted truncate">
          [{session.branch}]
        </span>
      )}

      {/* 右寄せボタン群 */}
      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
        {/* お気に入りトグル */}
        <AnimatedFavoriteButton
          isFavorite={session.isFavorite}
          onToggle={handleToggleFavorite}
        />

        {/* コード表示ボタン */}
        <button
          onClick={(e) => { e.stopPropagation(); handleOpenCode() }}
          className="text-xs text-transparent group-hover:text-text-muted hover:!text-accent transition-colors"
          title="コードを表示"
        >
          📂
        </button>
      </div>
    </div>
  )
}

import { useCallback } from 'react'
import type { Session } from '@kurimats/shared'
import { useSessionStore } from '../../stores/session-store'
import { AnimatedFavoriteButton } from '../animations/FavoriteAnimations'

interface PaneToolbarProps {
  session: Session
  paneId: string
  isActive?: boolean
}

/**
 * ペイン上部のツールバー
 * セッション名・ブランチ表示 + お気に入り★
 * - isActive=true のとき背景色を強調して現在フォーカスペインを視覚化
 * - ペイン境界を明示するため左右に border を付与
 */
export function PaneToolbar({ session, isActive = false }: PaneToolbarProps) {
  const toggleFavorite = useSessionStore(s => s.toggleFavorite)

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(session.id)
  }, [toggleFavorite, session.id])

  // アクティブ/非アクティブで背景色と下線を切替。
  // ペイン境界の視認性向上のため border-x を常時付与する。
  const activeClasses = isActive
    ? 'bg-surface-2 border-b-accent'
    : 'bg-surface-1 border-b-border'

  return (
    <div
      className={`group flex items-center gap-1 border-x border-b border-x-border px-2 h-6 flex-shrink-0 transition-colors ${activeClasses}`}
      data-testid="pane-toolbar"
    >
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
      </div>
    </div>
  )
}

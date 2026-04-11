import { useCallback } from 'react'
import type { Session } from '@kurimats/shared'
import { useSessionStore } from '../../stores/session-store'
import { useOverlayStore } from '../../stores/overlay-store'
import { AnimatedFavoriteButton } from '../animations/FavoriteAnimations'

interface PaneToolbarProps {
  session: Session
  paneId: string
  isActive?: boolean
}

/**
 * ペイン上部のツールバー
 * セッション名・ブランチ表示 + 📁ファイルツリー起動 + お気に入り★
 * - isActive=true のとき背景色を強調して現在フォーカスペインを視覚化
 * - ペイン境界を明示するため左右に border を付与
 * - 📁クリックでFileTreeOverlayを開き、MD/コードの全画面ビューアへの導線を提供
 */
export function PaneToolbar({ session, isActive = false }: PaneToolbarProps) {
  const toggleFavorite = useSessionStore(s => s.toggleFavorite)
  const openOverlay = useOverlayStore(s => s.openOverlay)

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(session.id)
  }, [toggleFavorite, session.id])

  const handleOpenFileTree = useCallback(() => {
    openOverlay('file-tree', { sessionId: session.id })
  }, [openOverlay, session.id])

  // アクティブ/非アクティブで背景色と下線色を切替。
  // - 背景は surface-0 (content) より一段明るい surface-1/2 を使い、バー本体を視認可能にする
  // - 下辺は border-b-2 に格上げし、accent / border-light の 2px ラインで分離線として機能させる
  // - ペイン境界の視認性向上のため border-x も常時付与する
  const activeClasses = isActive
    ? 'bg-surface-2 border-b-accent'
    : 'bg-surface-1 border-b-border-light'

  return (
    <div
      className={`group flex items-center gap-1 border-x border-b-2 border-x-border px-2 h-6 flex-shrink-0 transition-colors ${activeClasses}`}
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
        {/* ファイルツリー起動 → FileTreeOverlay経由で全画面MD/コードビューアを開く */}
        <button
          type="button"
          onClick={handleOpenFileTree}
          className="flex-shrink-0 leading-none text-xs text-text-muted hover:text-accent transition-colors cursor-pointer"
          title="ファイルツリーを開く"
          aria-label="ファイルツリーを開く"
          data-testid="file-tree-button"
        >
          📁
        </button>

        {/* お気に入りトグル */}
        <AnimatedFavoriteButton
          isFavorite={session.isFavorite}
          onToggle={handleToggleFavorite}
        />
      </div>
    </div>
  )
}

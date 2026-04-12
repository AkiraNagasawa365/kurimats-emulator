import { useState } from 'react'
import { useOverlayStore } from '../../stores/overlay-store'

type ActivityBarSection = 'workspaces' | 'favorites' | 'ssh' | 'settings'

interface ActivityBarProps {
  activeSection: ActivityBarSection | null
  onSectionToggle: (section: ActivityBarSection) => void
  totalNotifications: number
}

interface ActivityBarItem {
  id: ActivityBarSection
  icon: string
  label: string
  badge?: number
}

/**
 * 左端アイコンバー（48px幅）
 * cmux のサイドバー + VS Code の Activity Bar スタイル
 */
export function ActivityBar({ activeSection, onSectionToggle, totalNotifications }: ActivityBarProps) {
  const items: ActivityBarItem[] = [
    { id: 'workspaces', icon: '☰', label: 'ワークスペース', badge: totalNotifications > 0 ? totalNotifications : undefined },
    { id: 'favorites', icon: '★', label: 'お気に入り' },
    { id: 'ssh', icon: '⌁', label: 'SSH接続' },
  ]

  const bottomItems: ActivityBarItem[] = [
    { id: 'settings', icon: '⚙', label: '設定' },
  ]

  return (
    <div className="w-12 h-full bg-chrome border-r border-border flex flex-col items-center py-2 flex-shrink-0">
      {/* 上部アイコン */}
      <div className="flex flex-col items-center gap-1">
        {items.map(item => (
          <ActivityBarButton
            key={item.id}
            item={item}
            isActive={activeSection === item.id}
            onClick={() => onSectionToggle(item.id)}
          />
        ))}
      </div>

      {/* スペーサー */}
      <div className="flex-1" />

      {/* 下部アイコン */}
      <div className="flex flex-col items-center gap-1">
        <FeedbackButton />
        {bottomItems.map(item => (
          <ActivityBarButton
            key={item.id}
            item={item}
            isActive={activeSection === item.id}
            onClick={() => onSectionToggle(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ActivityBarButton({
  item,
  isActive,
  onClick,
}: {
  item: ActivityBarItem
  isActive: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <div className="relative">
      <button
        className={`
          w-10 h-10 flex items-center justify-center rounded-lg text-lg
          transition-colors relative
          ${isActive
            ? 'bg-surface-2 text-accent'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
          }
        `}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={item.label}
      >
        {item.icon}
        {/* 通知バッジ */}
        {item.badge && item.badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 flex items-center justify-center
                           bg-accent text-surface-0 text-[10px] font-bold rounded-full px-1">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </button>

      {/* アクティブインジケーター */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r" />
      )}

      {/* ツールチップ */}
      {hover && (
        <div className="absolute left-12 top-1/2 -translate-y-1/2 z-50
                        px-2 py-1 bg-surface-2 text-text-primary text-xs
                        rounded shadow-lg whitespace-nowrap border border-border">
          {item.label}
        </div>
      )}
    </div>
  )
}

function FeedbackButton() {
  const [hover, setHover] = useState(false)
  const openOverlay = useOverlayStore(s => s.openOverlay)

  return (
    <div className="relative">
      <button
        className="w-10 h-10 flex items-center justify-center rounded-lg text-lg
                   text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
        onClick={() => openOverlay('feedback')}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="フィードバック"
        data-testid="feedback-open-button"
      >
        💬
      </button>
      {hover && (
        <div className="absolute left-12 top-1/2 -translate-y-1/2 z-50
                        px-2 py-1 bg-surface-2 text-text-primary text-xs
                        rounded shadow-lg whitespace-nowrap border border-border">
          フィードバック
        </div>
      )}
    </div>
  )
}

export type { ActivityBarSection }

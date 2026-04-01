import type { Session } from '@kurimats/shared'

interface Props {
  session: Session
  isActive: boolean
  onClose: () => void
}

/**
 * ターミナルパネルのヘッダー
 * セッション名、ブランチ名、操作ボタンを表示
 */
export function TerminalHeader({ session, isActive, onClose }: Props) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-1 text-xs border-b ${
        isActive
          ? 'bg-surface-2 border-accent text-white'
          : 'bg-surface-1 border-border text-gray-400'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          session.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
        }`} />
        <span className="truncate font-medium">{session.name}</span>
        {session.branch && (
          <span className="text-gray-500 truncate">
            [{session.branch}]
          </span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="text-gray-500 hover:text-white px-1 rounded hover:bg-surface-3 transition-colors"
        title="セッション終了"
      >
        ×
      </button>
    </div>
  )
}

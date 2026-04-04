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
      className={`flex items-center justify-between px-3 py-1.5 text-xs border-b transition-colors ${
        isActive
          ? 'bg-tile-header border-accent text-text-primary'
          : 'bg-tile-header border-border text-text-secondary'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          session.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
        }`} />
        {session.isRemote && (
          <span className="text-[9px] px-1 py-0.5 bg-blue-900/30 text-blue-400 rounded flex-shrink-0 font-medium">
            SSH:{session.sshHost}
          </span>
        )}
        <span className="truncate font-medium">{session.name}</span>
        {session.branch && (
          <span className="text-text-muted truncate">
            [{session.branch}]
          </span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="text-text-muted hover:text-text-primary px-1 rounded hover:bg-surface-2 transition-colors"
        title="セッション終了"
      >
        ×
      </button>
    </div>
  )
}

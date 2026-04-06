import type { Session } from '@kurimats/shared'
import { useShellStateStore } from '../../stores/shell-state-store'

interface Props {
  session: Session
  isActive: boolean
  onClose: () => void
}

/**
 * ターミナルパネルのヘッダー
 * セッション名、ブランチ名、シェル状態、操作ボタンを表示
 */
export function TerminalHeader({ session, isActive, onClose }: Props) {
  const shellState = useShellStateStore((s) => s.getState(session.id))

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
        {/* シェル実行状態インジケーター */}
        {shellState.executionState === 'executing' && (
          <span className="flex items-center gap-1 text-yellow-400 flex-shrink-0" title="コマンド実行中">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[10px]">実行中</span>
          </span>
        )}
        {/* 直前コマンドの終了コード */}
        {shellState.lastExitCode !== null && shellState.executionState === 'idle' && (
          <span
            className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${
              shellState.lastExitCode === 0
                ? 'bg-green-900/30 text-green-400'
                : 'bg-red-900/30 text-red-400'
            }`}
            title={`終了コード: ${shellState.lastExitCode}`}
          >
            {shellState.lastExitCode === 0 ? '✓' : `✗ ${shellState.lastExitCode}`}
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

import { useCallback, useState } from 'react'
import type { CmuxWorkspace } from '@kurimats/shared'

interface WorkspaceItemProps {
  workspace: CmuxWorkspace
  isActive: boolean
  projectColor: string | null
  onClick: () => void
  onRename: (name: string) => void
  onTogglePin: () => void
  onDelete: () => void
}

/**
 * ワークスペースリストの1行
 * 名前 + ブランチ + 通知バッジ + ピンアイコン
 */
export function WorkspaceItem({
  workspace,
  isActive,
  projectColor,
  onClick,
  onRename,
  onTogglePin,
  onDelete,
}: WorkspaceItemProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [editName, setEditName] = useState(workspace.name)
  const [showContextMenu, setShowContextMenu] = useState(false)

  const handleDoubleClick = useCallback(() => {
    setEditName(workspace.name)
    setIsRenaming(true)
  }, [workspace.name])

  const handleRenameSubmit = useCallback(() => {
    if (editName.trim() && editName !== workspace.name) {
      onRename(editName.trim())
    }
    setIsRenaming(false)
  }, [editName, workspace.name, onRename])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    if (e.key === 'Escape') setIsRenaming(false)
  }, [handleRenameSubmit])

  return (
    <div className="relative">
      <div
        className={`
          flex flex-col px-3 py-1.5 cursor-pointer
          transition-colors text-sm group
          ${isActive
            ? 'bg-surface-2 text-text-primary'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
          }
        `}
        onClick={onClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault()
          setShowContextMenu(true)
        }}
      >
        {/* 上段: 名前 + バッジ */}
        <div className="flex items-center gap-2">
          {/* プロジェクトカラーインジケーター */}
          {projectColor && (
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: projectColor }}
            />
          )}

          {/* ワークスペース名 or リネーム入力 */}
          {isRenaming ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-surface-0 border border-accent rounded px-1 py-0 text-xs
                       text-text-primary outline-none"
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate">{workspace.name}</span>
        )}

        {/* SSHホスト表示 */}
        {workspace.sshHost && (
          <span className="text-[10px] text-blue-400 truncate max-w-16">
            SSH
          </span>
        )}

        {/* ピン（お気に入り）トグルボタン */}
        <span
          onClick={(e) => { e.stopPropagation(); onTogglePin() }}
          className={`text-[10px] flex-shrink-0 cursor-pointer transition-colors ${
            workspace.isPinned
              ? 'text-yellow-500 hover:text-yellow-400'
              : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-yellow-500'
          }`}
          title={workspace.isPinned ? 'お気に入り解除' : 'お気に入りに追加'}
        >
          ★
        </span>

        {/* 通知バッジ */}
        {workspace.notificationCount > 0 && (
          <span className="min-w-4 h-4 flex items-center justify-center
                           bg-accent text-surface-0 text-[10px] font-bold rounded-full px-1">
            {workspace.notificationCount}
          </span>
        )}
        </div>

        {/* 下段: プロジェクト情報（リポパス + SSHホスト） */}
        <div className="flex items-center gap-1 mt-0.5">
          {workspace.sshHost && (
            <span className="text-[10px] text-blue-400 truncate">
              {workspace.sshHost}:
            </span>
          )}
          <span className="text-[10px] text-text-muted truncate">
            {workspace.repoPath.split('/').slice(-2).join('/')}
          </span>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {showContextMenu && (
        <WorkspaceContextMenu
          workspace={workspace}
          onClose={() => setShowContextMenu(false)}
          onRename={() => { setShowContextMenu(false); handleDoubleClick() }}
          onTogglePin={() => { setShowContextMenu(false); onTogglePin() }}
          onDelete={() => { setShowContextMenu(false); onDelete() }}
        />
      )}
    </div>
  )
}

function WorkspaceContextMenu({
  workspace,
  onClose,
  onRename,
  onTogglePin,
  onDelete,
}: {
  workspace: CmuxWorkspace
  onClose: () => void
  onRename: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  return (
    <>
      {/* 背景クリックで閉じる */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-0 top-full z-50 bg-chrome border border-border
                      rounded shadow-lg py-1 min-w-36">
        <button
          className="w-full px-3 py-1 text-xs text-text-primary hover:bg-surface-2 text-left"
          onClick={onRename}
        >
          名前を変更
        </button>
        <button
          className="w-full px-3 py-1 text-xs text-text-primary hover:bg-surface-2 text-left"
          onClick={onTogglePin}
        >
          {workspace.isPinned ? 'ピン解除' : 'ピン留め'}
        </button>
        <div className="my-1 border-t border-border" />
        <button
          className="w-full px-3 py-1 text-xs text-red-400 hover:bg-surface-2 text-left"
          onClick={onDelete}
        >
          削除
        </button>
      </div>
    </>
  )
}

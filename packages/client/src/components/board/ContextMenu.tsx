import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session, Project } from '@kurimats/shared'

interface ContextMenuPosition {
  x: number
  y: number
}

// ノード上の右クリックメニュー
interface NodeContextMenuProps {
  position: ContextMenuPosition
  session: Session
  projects: Project[]
  onClose: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  onAssignProject: (projectId: string | null) => void
  onRename: (newName: string) => void
}

export function NodeContextMenu({
  position,
  session,
  projects,
  onClose,
  onDelete,
  onToggleFavorite,
  onAssignProject,
  onRename,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showProjectSubmenu, setShowProjectSubmenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(session.name)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== session.name) {
      onRename(renameValue.trim())
    }
    setIsRenaming(false)
    onClose()
  }, [renameValue, session.name, onRename, onClose])

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[100] min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      {isRenaming ? (
        <div className="px-3 py-2">
          <input
            autoFocus
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded outline-none focus:border-accent"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') { setIsRenaming(false); onClose() }
            }}
            onBlur={handleRenameSubmit}
          />
        </div>
      ) : (
        <>
          <MenuItem
            label={session.isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
            icon={session.isFavorite ? '★' : '☆'}
            onClick={() => { onToggleFavorite(); onClose() }}
          />
          <MenuItem
            label="名前を変更"
            icon="✏️"
            onClick={() => setIsRenaming(true)}
          />
          <div className="relative">
            <MenuItem
              label="プロジェクト変更"
              icon="📂"
              onClick={() => setShowProjectSubmenu(!showProjectSubmenu)}
              hasSubmenu
            />
            {showProjectSubmenu && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px]">
                <MenuItem
                  label="なし"
                  onClick={() => { onAssignProject(null); onClose() }}
                  isActive={!session.projectId}
                />
                {projects.map(p => (
                  <MenuItem
                    key={p.id}
                    label={p.name}
                    onClick={() => { onAssignProject(p.id); onClose() }}
                    isActive={session.projectId === p.id}
                    colorDot={p.color}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="my-1 border-t border-gray-100" />
          <MenuItem
            label="セッションを削除"
            icon="🗑️"
            onClick={() => { onDelete(); onClose() }}
            danger
          />
        </>
      )}
    </div>
  )
}

// キャンバス空白部分の右クリックメニュー
interface CanvasContextMenuProps {
  position: ContextMenuPosition
  onClose: () => void
  onCreateSession: () => void
  onAutoLayout: () => void
}

export function CanvasContextMenu({
  position,
  onClose,
  onCreateSession,
  onAutoLayout,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[100] min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      <MenuItem
        label="新規セッション作成"
        icon="➕"
        onClick={() => { onCreateSession(); onClose() }}
      />
      <MenuItem
        label="ノード整列"
        icon="📐"
        onClick={() => { onAutoLayout(); onClose() }}
      />
    </div>
  )
}

// メニュー項目コンポーネント
function MenuItem({
  label,
  icon,
  onClick,
  danger,
  hasSubmenu,
  isActive,
  colorDot,
}: {
  label: string
  icon?: string
  onClick: () => void
  danger?: boolean
  hasSubmenu?: boolean
  isActive?: boolean
  colorDot?: string
}) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : isActive
            ? 'text-accent bg-accent/5 hover:bg-accent/10'
            : 'text-gray-700 hover:bg-gray-100'
      }`}
      onClick={onClick}
    >
      {colorDot && (
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: colorDot }}
        />
      )}
      {icon && <span className="w-5 text-center">{icon}</span>}
      <span className="flex-1">{label}</span>
      {hasSubmenu && <span className="text-gray-400">▶</span>}
    </button>
  )
}

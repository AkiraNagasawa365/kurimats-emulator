import { useMemo, useState, useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useSessionStore } from '../../stores/session-store'
import { WorkspaceItem } from './WorkspaceItem'
import { SearchFilter } from './SearchFilter'
import type { ActivityBarSection } from './ActivityBar'

interface WorkspaceNavigatorProps {
  activeSection: ActivityBarSection
}

/**
 * 展開可能なサイドパネル
 * ワークスペース/お気に入り/SSH の各セクションを表示
 */
export function WorkspaceNavigator({ activeSection }: WorkspaceNavigatorProps) {
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRepoPath, setNewRepoPath] = useState('')
  const [newSshHost, setNewSshHost] = useState('')
  const [creating, setCreating] = useState(false)

  const {
    workspaces,
    workspaceOrder,
    activeWorkspaceId,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
    togglePin,
  } = useWorkspaceStore()

  const { projects } = useSessionStore()

  // フィルタ済みワークスペース（表示順序を保持）
  const filteredWorkspaces = useMemo(() => {
    const ordered = workspaceOrder
      .map(id => workspaces.find(w => w.id === id))
      .filter((w): w is NonNullable<typeof w> => w != null)

    if (!search) {
      if (activeSection === 'favorites') {
        return ordered.filter(w => w.isPinned)
      }
      return ordered
    }

    const lower = search.toLowerCase()
    return ordered.filter(w =>
      w.name.toLowerCase().includes(lower) ||
      (w.repoPath ?? '').toLowerCase().includes(lower),
    )
  }, [workspaces, workspaceOrder, search, activeSection])

  // プロジェクトカラーマップ
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) {
      map.set(p.id, p.color)
    }
    return map
  }, [projects])

  const handleCreateWorkspace = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newRepoPath.trim()) return
    setCreating(true)
    try {
      await createWorkspace({
        name: newName.trim(),
        repoPath: newRepoPath.trim(),
        sshHost: newSshHost.trim() || undefined,
      })
      setNewName('')
      setNewRepoPath('')
      setNewSshHost('')
      setShowNewForm(false)
    } catch (e) {
      console.error('ワークスペース作成エラー:', e)
    } finally {
      setCreating(false)
    }
  }, [newName, newRepoPath, newSshHost, createWorkspace])

  const sectionTitle = activeSection === 'favorites' ? 'お気に入り'
    : activeSection === 'ssh' ? 'SSH接続'
    : 'ワークスペース'

  return (
    <div className="w-60 h-full bg-surface-1 border-r border-border flex flex-col flex-shrink-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-text-primary uppercase tracking-wider">
          {sectionTitle}
        </span>
        {activeSection === 'workspaces' && (
          <button
            className="text-text-secondary hover:text-accent text-lg leading-none transition-colors"
            onClick={() => setShowNewForm(!showNewForm)}
            title="新規ワークスペース (⌘N)"
          >
            +
          </button>
        )}
      </div>

      {/* 新規作成フォーム */}
      {showNewForm && (
        <form onSubmit={handleCreateWorkspace} className="px-3 py-2 border-b border-border space-y-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ワークスペース名..."
            className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded
                       text-text-primary placeholder-text-muted
                       focus:border-accent focus:outline-none"
            autoFocus
          />
          <input
            type="text"
            value={newRepoPath}
            onChange={(e) => setNewRepoPath(e.target.value)}
            placeholder="リポジトリパス（必須）..."
            className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded
                       text-text-primary placeholder-text-muted
                       focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={newSshHost}
            onChange={(e) => setNewSshHost(e.target.value)}
            placeholder="SSHホスト（空ならローカル）..."
            className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded
                       text-text-primary placeholder-text-muted
                       focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newName.trim() || !newRepoPath.trim()}
              className="flex-1 px-2 py-1 text-xs bg-accent text-surface-0 rounded
                         hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {creating ? '起動中...' : '作成 + Claude Code'}
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              onClick={() => setShowNewForm(false)}
            >
              ×
            </button>
          </div>
        </form>
      )}

      {/* 検索フィルタ */}
      <SearchFilter value={search} onChange={setSearch} placeholder="名前・ブランチで検索..." />

      {/* ワークスペースリスト */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredWorkspaces.length === 0 ? (
          <div className="px-3 py-4 text-xs text-text-muted text-center">
            {search ? '一致するワークスペースがありません' : 'ワークスペースがありません'}
          </div>
        ) : (
          filteredWorkspaces.map(ws => (
            <WorkspaceItem
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              projectColor={ws.projectId ? projectColorMap.get(ws.projectId) ?? null : null}
              onClick={() => switchWorkspace(ws.id)}
              onRename={(name) => renameWorkspace(ws.id, name)}
              onTogglePin={() => togglePin(ws.id)}
              onDelete={() => deleteWorkspace(ws.id)}
            />
          ))
        )}
      </div>

      {/* フッター: ワークスペース数 */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted">
        {workspaces.length} ワークスペース
      </div>
    </div>
  )
}

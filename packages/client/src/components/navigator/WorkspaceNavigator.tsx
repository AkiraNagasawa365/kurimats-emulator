import { useMemo, useState, useCallback, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useSessionStore } from '../../stores/session-store'
import { WorkspaceItem } from './WorkspaceItem'
import { SearchFilter } from './SearchFilter'
import type { ActivityBarSection } from './ActivityBar'
import type { TabBookmark } from '@kurimats/shared'
import { tabApi } from '../../lib/api'

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
  const [bookmarks, setBookmarks] = useState<TabBookmark[]>([])
  const [bookmarkSearch, setBookmarkSearch] = useState('')

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

  // tabブックマークを取得
  useEffect(() => {
    tabApi.bookmarks()
      .then(({ bookmarks }) => setBookmarks(bookmarks))
      .catch(() => {/* ブックマーク取得失敗は無視 */})
  }, [])

  // フィルタ済みブックマーク
  const filteredBookmarks = useMemo(() => {
    if (!bookmarkSearch) return bookmarks
    const lower = bookmarkSearch.toLowerCase()
    return bookmarks.filter(b =>
      b.name.toLowerCase().includes(lower) ||
      b.directory.toLowerCase().includes(lower) ||
      (b.host ?? '').toLowerCase().includes(lower),
    )
  }, [bookmarks, bookmarkSearch])

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

  // ブックマーク選択 → フォーム自動入力
  const handleBookmarkSelect = useCallback((bookmark: TabBookmark) => {
    // プロジェクト名 = ブックマーク名（ホスト:プロジェクト形式の場合はプロジェクト部分）
    const projectName = bookmark.name.includes(':')
      ? bookmark.name.split(':').pop()!
      : bookmark.name
    setNewName(projectName)
    setNewRepoPath(bookmark.directory)
    setNewSshHost(bookmark.host ?? '')
    setBookmarkSearch('')
  }, [])

  const handleCreateWorkspace = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRepoPath.trim()) return
    // 名前が空ならパスの末尾をデフォルト名にする
    const name = newName.trim() || newRepoPath.trim().split('/').filter(Boolean).pop() || 'workspace'
    setCreating(true)
    try {
      await createWorkspace({
        name,
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
        <div className="px-3 py-2 border-b border-border space-y-1.5">
          {/* ブックマーク選択 */}
          {bookmarks.length > 0 && !newRepoPath && (
            <div>
              <input
                type="text"
                value={bookmarkSearch}
                onChange={(e) => setBookmarkSearch(e.target.value)}
                placeholder="プロジェクトを検索..."
                className="w-full px-2 py-1 text-xs bg-surface-0 border border-accent rounded
                           text-text-primary placeholder-text-muted
                           focus:border-accent focus:outline-none"
                autoFocus
              />
              <div className="mt-1 max-h-48 overflow-y-auto custom-scrollbar border border-border rounded">
                {filteredBookmarks.map((bm) => (
                  <button
                    key={bm.name}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-surface-2 transition-colors
                               flex flex-col border-b border-border last:border-b-0"
                    onClick={() => handleBookmarkSelect(bm)}
                  >
                    <span className="text-text-primary font-medium">{bm.name}</span>
                    <span className="text-[10px] text-text-muted truncate">
                      {bm.host && <span className="text-blue-400">{bm.host}:</span>}
                      {bm.directory}
                    </span>
                  </button>
                ))}
                {filteredBookmarks.length === 0 && (
                  <div className="px-2 py-2 text-[10px] text-text-muted text-center">
                    一致するプロジェクトがありません
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 選択後のフォーム or 手動入力 */}
          {(newRepoPath || bookmarks.length === 0) && (
            <form onSubmit={handleCreateWorkspace} className="space-y-1.5">
              {/* 選択済みプロジェクト表示 */}
              {newRepoPath && bookmarks.length > 0 && (
                <div className="flex items-center justify-between bg-surface-0 rounded px-2 py-1 border border-border">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-text-primary font-medium truncate">{newName || 'workspace'}</span>
                    <span className="text-[10px] text-text-muted truncate">
                      {newSshHost && <span className="text-blue-400">{newSshHost}:</span>}
                      {newRepoPath}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-text-muted hover:text-text-primary text-xs ml-1 flex-shrink-0"
                    onClick={() => { setNewRepoPath(''); setNewName(''); setNewSshHost('') }}
                  >
                    変更
                  </button>
                </div>
              )}

              {/* ブックマークなし or 手動入力時 */}
              {bookmarks.length === 0 && (
                <>
                  <input
                    type="text"
                    value={newRepoPath}
                    onChange={(e) => {
                      setNewRepoPath(e.target.value)
                      if (!newName) {
                        const auto = e.target.value.split('/').filter(Boolean).pop() || ''
                        setNewName(auto)
                      }
                    }}
                    placeholder="リポジトリパス（必須）..."
                    className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded
                               text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newSshHost}
                    onChange={(e) => setNewSshHost(e.target.value)}
                    placeholder="SSHホスト（空ならローカル）..."
                    className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded
                               text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                  />
                </>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating || !newRepoPath.trim()}
                  className="flex-1 px-2 py-1 text-xs bg-accent text-surface-0 rounded
                             hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {creating ? '起動中...' : '作成 + Claude Code'}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                  onClick={() => { setShowNewForm(false); setNewRepoPath(''); setNewName(''); setNewSshHost('') }}
                >
                  ×
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 検索フィルタ */}
      <SearchFilter value={search} onChange={setSearch} placeholder="名前・パスで検索..." />

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

      {/* フッター */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted">
        {workspaces.length} ワークスペース
      </div>
    </div>
  )
}

import { useState, useMemo, useEffect } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import type { Session } from '@kurimats/shared'
import { PROJECT_COLORS } from '@kurimats/shared'
import { useSessionStore } from '../../stores/session-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useSshStore } from '../../stores/ssh-store'
import { tabApi } from '../../lib/api'
import { useOverlayStore } from '../../stores/overlay-store'
import {
  AnimatedFavoriteButton,
  FavoriteBadge,
  gatherVariants,
  disperseVariants,
  fadeOutVariants,
} from '../animations/FavoriteAnimations'

/**
 * サイドバー
 * セッション一覧、お気に入り、プロジェクト管理、レイアウト変更
 */
export function Sidebar() {
  const { sessions, projects, createSession, toggleFavorite, assignProject, createProject, fetchProjects, fetchSessions, reconnectSession } = useSessionStore()
  const { addPanel, setActiveSession, boardNodes } = useLayoutStore()
  const { hosts, fetchHosts, connectHost, disconnectHost } = useSshStore()
  const { openOverlay } = useOverlayStore()
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRepoPath, setNewRepoPath] = useState('')
  const [newProjectId, setNewProjectId] = useState<string | null>(null)
  const [newSshHost, setNewSshHost] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false)
  const [projectsCollapsed, setProjectsCollapsed] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sshCollapsed, setSshCollapsed] = useState(false)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState<string>(PROJECT_COLORS[0])
  const [tabSyncing, setTabSyncing] = useState(false)
  const [tabSyncResult, setTabSyncResult] = useState<string | null>(null)
  const [creatingProjectId, setCreatingProjectId] = useState<string | null>(null)

  // SSHホスト一覧を初回取得
  useEffect(() => {
    fetchHosts()
  }, [fetchHosts])

  // お気に入りセッション
  const favoriteSessions = useMemo(() =>
    sessions.filter(s => s.isFavorite),
    [sessions]
  )

  // 検索フィルタリング
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.branch?.toLowerCase().includes(q) ||
      s.repoPath.toLowerCase().includes(q)
    )
  }, [sessions, searchQuery])

  // プロジェクト別にセッションをグループ化
  const sessionsByProject = useMemo(() => {
    const grouped = new Map<string, Session[]>()
    const unassigned: Session[] = []
    for (const s of filteredSessions) {
      if (s.projectId) {
        const list = grouped.get(s.projectId) || []
        list.push(s)
        grouped.set(s.projectId, list)
      } else {
        unassigned.push(s)
      }
    }
    return { grouped, unassigned }
  }, [filteredSessions])

  const handleCreate = async () => {
    if (!newName.trim() || !newRepoPath.trim()) return
    try {
      const session = await createSession({
        name: newName.trim(),
        repoPath: newRepoPath.trim(),
        sshHost: newSshHost || undefined,
      })
      if (newProjectId) {
        await assignProject(session.id, newProjectId)
      }
      addPanel(session.id)
      setNewName('')
      setNewRepoPath('')
      setNewProjectId(null)
      setNewSshHost('')
      setShowNewForm(false)
    } catch (e) {
      alert(`作成エラー: ${e}`)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    try {
      await createProject({
        name: newProjectName.trim(),
        color: newProjectColor,
        repoPath: '',
      })
      setNewProjectName('')
      setNewProjectColor(PROJECT_COLORS[0])
      setShowProjectForm(false)
    } catch (e) {
      alert(`プロジェクト作成エラー: ${e}`)
    }
  }

  const handleSessionClick = (session: Session) => {
    const isOnBoard = boardNodes.some(n => n.sessionId === session.id)
    if (isOnBoard) {
      setActiveSession(session.id)
    } else {
      addPanel(session.id)
    }
  }

  const handleProjectClick = async (project: { id: string; name: string; repoPath: string }) => {
    if (creatingProjectId) return // 二重クリック防止
    // プロジェクトに紐づく既存セッションを探す
    const existing = sessions.find(s => s.projectId === project.id)
    if (existing) {
      handleSessionClick(existing)
      return
    }
    // 存在しなければ新規セッション作成
    await handleAddSessionToProject(project)
  }

  // プロジェクトに新規セッションを追加（worktree自動分離）
  const handleAddSessionToProject = async (project: { id: string; name: string; repoPath: string }) => {
    if (creatingProjectId) return
    setCreatingProjectId(project.id)
    try {
      // 同プロジェクトの既存セッションIDを取得（ボード配置の兄弟ノード用）
      const siblings = sessions.filter(s => s.projectId === project.id)
      const siblingIds = siblings.map(s => s.id)
      // 連番を生成
      const sessionName = siblings.length === 0
        ? project.name
        : `${project.name}-${siblings.length + 1}`
      const session = await createSession({
        name: sessionName,
        repoPath: project.repoPath,
        useWorktree: true,
      })
      await assignProject(session.id, project.id)
      // 兄弟ノードの隣に配置
      addPanel(session.id, siblingIds)
    } catch (e) {
      alert(`セッション作成エラー: ${e}`)
    } finally {
      setCreatingProjectId(null)
    }
  }

  const handleTabSync = async () => {
    setTabSyncing(true)
    setTabSyncResult(null)
    try {
      const result = await tabApi.sync()
      // プロジェクト一覧を更新
      await fetchProjects()
      // セッション一覧を更新
      await fetchSessions()
      // 作成されたセッションをボードに配置
      for (const session of result.sessions) {
        addPanel(session.id)
      }
      const sessionCount = result.sessions.length
      setTabSyncResult(
        `${result.created}件プロジェクト / ${sessionCount}件セッション作成`
      )
    } catch (e) {
      setTabSyncResult(`同期エラー: ${e}`)
    } finally {
      setTabSyncing(false)
      setTimeout(() => setTabSyncResult(null), 5000)
    }
  }

  const getProjectColor = (projectId: string | null) => {
    if (!projectId) return null
    return projects.find(p => p.id === projectId)?.color ?? null
  }

  return (
    <div className="w-60 bg-surface-1 border-r border-border flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-bold text-text-primary">Kurimats</h1>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors text-lg leading-none"
          title="新規セッション"
        >
          +
        </button>
      </div>

      {/* 新規セッション作成フォーム */}
      {showNewForm && (
        <div className="p-3 border-b border-border space-y-2 bg-surface-0">
          <input
            type="text"
            placeholder="セッション名"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
            autoFocus
          />
          <input
            type="text"
            placeholder="リポジトリパス"
            value={newRepoPath}
            onChange={e => setNewRepoPath(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          {/* SSHホスト選択 */}
          {hosts.length > 0 && (
            <select
              value={newSshHost}
              onChange={e => setNewSshHost(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary outline-none focus:border-accent"
            >
              <option value="">ローカル</option>
              {hosts.filter(h => h.isConnected).map(h => (
                <option key={h.name} value={h.name}>SSH: {h.name} ({h.user}@{h.hostname})</option>
              ))}
            </select>
          )}
          {/* プロジェクト選択 */}
          {projects.length > 0 && (
            <select
              value={newProjectId || ''}
              onChange={e => setNewProjectId(e.target.value || null)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary outline-none focus:border-accent"
            >
              <option value="">プロジェクトなし</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleCreate}
            className="w-full px-2 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors font-medium"
          >
            作成
          </button>
        </div>
      )}

      {/* セッション検索 */}
      <div className="px-3 py-2 border-b border-border">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="セッションを検索..."
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
        />
      </div>

      {/* セッション一覧エリア */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* お気に入りセクション */}
        {favoriteSessions.length > 0 && (
          <div>
            <div className="flex items-center">
              <button
                onClick={() => setFavoritesCollapsed(!favoritesCollapsed)}
                className="flex-1 text-left px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-2 transition-colors flex items-center gap-1"
              >
                <span className="text-[8px]">{favoritesCollapsed ? '▶' : '▼'}</span>
                お気に入り
                <FavoriteBadge count={favoriteSessions.length} />
              </button>
              {/* お気に入りフィルターボタン */}
              <button
                onClick={() => setFavoritesOnly(!favoritesOnly)}
                className={`px-2 py-1 text-[10px] mr-1 rounded transition-colors ${
                  favoritesOnly
                    ? 'bg-yellow-500 text-white'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
                }`}
                title={favoritesOnly ? 'フィルター解除' : 'お気に入りのみ表示'}
                data-testid="favorites-filter-button"
              >
                ★
              </button>
            </div>
            <LayoutGroup>
              <AnimatePresence mode="popLayout">
                {!favoritesCollapsed && favoriteSessions.map(session => (
                  <motion.div
                    key={`fav-${session.id}`}
                    layout
                    variants={disperseVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <SessionItem
                      session={session}
                      isOnBoard={boardNodes.some(n => n.sessionId === session.id)}
                      projectColor={getProjectColor(session.projectId)}
                      onClick={() => handleSessionClick(session)}
                      onToggleFavorite={() => toggleFavorite(session.id)}
                      onReconnect={() => reconnectSession(session.id).then(() => handleSessionClick(session)).catch(e => alert(`再接続エラー: ${e}`))}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </LayoutGroup>
          </div>
        )}

        {/* セッション一覧（プロジェクト別グループ化） */}
        <div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
            セッション
            <span className="text-text-muted ml-1">{filteredSessions.length}</span>
          </div>

          {filteredSessions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-muted text-center">
              {searchQuery ? '一致するセッションなし' : 'セッションなし'}
            </p>
          ) : (
            <>
              {/* プロジェクト別グループ */}
              {projects.map(project => {
                const projectSessions = sessionsByProject.grouped.get(project.id)
                if (!projectSessions || projectSessions.length === 0) return null
                return (
                  <div key={project.id} className="mb-1">
                    <div className="flex items-center px-3 py-1 hover:bg-surface-2 transition-colors">
                      <span
                        className="w-2 h-2 rounded-sm flex-shrink-0 mr-1.5"
                        style={{ backgroundColor: project.color }}
                      />
                      <span
                        className="text-[10px] font-semibold text-text-secondary flex-1 truncate cursor-pointer"
                        onClick={() => handleProjectClick(project)}
                      >
                        {project.name}
                        <span className="text-text-muted ml-1">{projectSessions.length}</span>
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddSessionToProject(project) }}
                        className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-accent text-[10px] rounded hover:bg-surface-3 transition-colors"
                        title={`${project.name} に新規セッション追加`}
                      >
                        +
                      </button>
                    </div>
                    {projectSessions.map(session => {
                      const isVisible = !favoritesOnly || session.isFavorite
                      if (!isVisible) return null
                      return (
                        <div key={session.id} className="pl-3">
                          <SessionItem
                            session={session}
                            isOnBoard={boardNodes.some(n => n.sessionId === session.id)}
                            projectColor={project.color}
                            onClick={() => handleSessionClick(session)}
                            onToggleFavorite={() => toggleFavorite(session.id)}
                            onReconnect={() => reconnectSession(session.id).then(() => handleSessionClick(session)).catch(e => alert(`再接続エラー: ${e}`))}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* プロジェクト未割り当て */}
              {sessionsByProject.unassigned.length > 0 && (
                <div className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-text-muted">
                    未割り当て
                    <span className="ml-1">{sessionsByProject.unassigned.length}</span>
                  </div>
                  {sessionsByProject.unassigned.map(session => {
                    const isVisible = !favoritesOnly || session.isFavorite
                    if (!isVisible) return null
                    return (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isOnBoard={boardNodes.some(n => n.sessionId === session.id)}
                        projectColor={null}
                        onClick={() => handleSessionClick(session)}
                        onToggleFavorite={() => toggleFavorite(session.id)}
                        onReconnect={() => reconnectSession(session.id).then(() => handleSessionClick(session)).catch(e => alert(`再接続エラー: ${e}`))}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* プロジェクト管理セクション */}
        <div className="border-t border-border mt-1">
          <div className="flex items-center">
            <button
              onClick={() => setProjectsCollapsed(!projectsCollapsed)}
              className="flex-1 text-left px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-2 transition-colors flex items-center gap-1"
            >
              <span className="text-[8px]">{projectsCollapsed ? '▶' : '▼'}</span>
              プロジェクト管理
            </button>
          </div>
          {!projectsCollapsed && (
            <>
              {/* tab同期ボタン */}
              <button
                onClick={handleTabSync}
                disabled={tabSyncing}
                className="w-full text-left px-3 py-1.5 text-xs text-cyan-600 hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {tabSyncing ? '同期中...' : 'tab同期'}
              </button>
              {tabSyncResult && (
                <p className="px-3 py-1 text-[10px] text-text-muted">{tabSyncResult}</p>
              )}

              {/* 新規プロジェクト */}
              {showProjectForm ? (
                <div className="px-3 py-2 space-y-2">
                  <input
                    type="text"
                    placeholder="プロジェクト名"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-white border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                  />
                  <div className="flex gap-1 flex-wrap">
                    {PROJECT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setNewProjectColor(color)}
                        className={`w-5 h-5 rounded-sm transition-transform ${
                          newProjectColor === color ? 'ring-2 ring-accent ring-offset-1 scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={handleCreateProject}
                      className="flex-1 px-2 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                    >
                      作成
                    </button>
                    <button
                      onClick={() => setShowProjectForm(false)}
                      className="px-2 py-1 text-xs bg-surface-2 text-text-secondary hover:bg-surface-3 rounded transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowProjectForm(true)}
                  className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-surface-2 transition-colors"
                >
                  + 新規プロジェクト
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* SSHホストセクション */}
      {hosts.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setSshCollapsed(!sshCollapsed)}
            className="w-full text-left px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-2 transition-colors flex items-center gap-1"
          >
            <span className="text-[8px]">{sshCollapsed ? '▶' : '▼'}</span>
            SSHホスト
            <span className="text-text-muted ml-auto">{hosts.length}</span>
          </button>
          {!sshCollapsed && hosts.map(host => (
            <SshHostItem
              key={host.name}
              host={host}
              onConnect={() => connectHost(host.name).catch(() => {})}
              onDisconnect={() => disconnectHost(host.name)}
            />
          ))}
        </div>
      )}

      {/* フッター */}
      <div className="px-3 py-2.5 border-t border-border space-y-1">
        <p className="text-[10px] text-text-secondary font-medium">
          ボード: {boardNodes.length}件のセッション
        </p>
        <button
          onClick={() => openOverlay('feedback')}
          className="w-full text-left text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 px-1 py-1 rounded transition-colors"
          data-testid="feedback-open-button"
        >
          フィードバック
        </button>
      </div>
    </div>
  )
}

/**
 * セッションリストアイテム
 */
function SessionItem({
  session,
  isOnBoard,
  projectColor,
  onClick,
  onToggleFavorite,
  onReconnect,
}: {
  session: Session
  isOnBoard: boolean
  projectColor: string | null
  onClick: () => void
  onToggleFavorite: () => void
  onReconnect?: () => void
}) {
  const isDisconnected = session.status === 'disconnected'

  return (
    <div
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-surface-2 transition-colors group ${
        isOnBoard ? 'text-text-primary font-medium' : 'text-text-secondary'
      } ${isDisconnected ? 'opacity-60' : ''}`}
    >
      {/* クリック領域 */}
      <button onClick={onClick} className="flex items-center gap-2 flex-1 min-w-0">
        {/* ステータスドット */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          session.status === 'active' ? 'bg-green-500'
            : session.status === 'disconnected' ? 'bg-yellow-500'
            : 'bg-gray-400'
        }`} />

        {/* プロジェクトカラードット */}
        {projectColor && (
          <span
            className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: projectColor }}
          />
        )}

        {/* セッション名 */}
        <span className="truncate flex-1">{session.name}</span>
      </button>

      {/* disconnected時の再接続ボタン */}
      {isDisconnected && onReconnect && (
        <button
          onClick={(e) => { e.stopPropagation(); onReconnect() }}
          className="text-[9px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded flex-shrink-0 transition-colors"
          title="再接続"
        >
          再接続
        </button>
      )}

      {/* リモートバッジ */}
      {session.isRemote && (
        <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-600 rounded flex-shrink-0">
          SSH
        </span>
      )}

      {/* ボード上表示インジケーター */}
      {isOnBoard && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent" title="ボード上に表示中" />
      )}

      {/* お気に入りボタン（アニメーション付き） */}
      <AnimatedFavoriteButton
        isFavorite={session.isFavorite}
        onToggle={onToggleFavorite}
      />
    </div>
  )
}

/**
 * SSHホストリストアイテム
 */
function SshHostItem({
  host,
  onConnect,
  onDisconnect,
}: {
  host: import('@kurimats/shared').SshHost
  onConnect: () => void
  onDisconnect: () => void
}) {
  const statusColor = host.isConnected ? 'bg-green-500' : 'bg-gray-400'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-surface-2 transition-colors group">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor}`} />
      <span className="truncate flex-1" title={`${host.user}@${host.hostname}:${host.port}`}>
        {host.name}
      </span>
      <button
        onClick={host.isConnected ? onDisconnect : onConnect}
        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 ${
          host.isConnected
            ? 'bg-red-100 text-red-600 hover:bg-red-200'
            : 'bg-green-100 text-green-600 hover:bg-green-200'
        }`}
      >
        {host.isConnected ? '切断' : '接続'}
      </button>
    </div>
  )
}

import type { ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import type { Project, Session, SshHost } from '@kurimats/shared'
import { PROJECT_COLORS } from '@kurimats/shared'
import { AnimatedFavoriteButton, FavoriteBadge, disperseVariants } from '../../animations/FavoriteAnimations'

export function SidebarSessionItem({
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
      <button onClick={onClick} className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          session.status === 'active' ? 'bg-green-500'
            : session.status === 'disconnected' ? 'bg-yellow-500'
            : 'bg-gray-400'
        }`} />
        {projectColor && (
          <span
            className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: projectColor }}
          />
        )}
        <span className="truncate flex-1">{session.name}</span>
      </button>

      {isDisconnected && onReconnect && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            onReconnect()
          }}
          className="text-[9px] px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 rounded flex-shrink-0 transition-colors"
          title="再接続"
        >
          再接続
        </button>
      )}

      {session.isRemote && (
        <span className="text-[9px] px-1 py-0.5 bg-blue-900/30 text-blue-400 rounded flex-shrink-0">
          SSH
        </span>
      )}

      {isOnBoard && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent" title="ボード上に表示中" />
      )}

      <AnimatedFavoriteButton isFavorite={session.isFavorite} onToggle={onToggleFavorite} />
    </div>
  )
}

export function SidebarSshHostItem({
  host,
  onConnect,
  onDisconnect,
}: {
  host: SshHost
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-surface-2 transition-colors group">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${host.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
      <span className="truncate flex-1" title={`${host.user}@${host.hostname}:${host.port}`}>
        {host.name}
      </span>
      <button
        onClick={host.isConnected ? onDisconnect : onConnect}
        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 ${
          host.isConnected
            ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
            : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
        }`}
      >
        {host.isConnected ? '切断' : '接続'}
      </button>
    </div>
  )
}

export function SidebarCreateSessionForm({
  visible,
  name,
  repoPath,
  projectId,
  sshHost,
  projects,
  hosts,
  onNameChange,
  onRepoPathChange,
  onProjectIdChange,
  onSshHostChange,
  onSubmit,
}: {
  visible: boolean
  name: string
  repoPath: string
  projectId: string | null
  sshHost: string
  projects: Project[]
  hosts: SshHost[]
  onNameChange: (value: string) => void
  onRepoPathChange: (value: string) => void
  onProjectIdChange: (value: string | null) => void
  onSshHostChange: (value: string) => void
  onSubmit: () => void
}) {
  if (!visible) {
    return null
  }

  return (
    <div className="p-3 border-b border-border space-y-2 bg-surface-1">
      <input
        type="text"
        placeholder="セッション名"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
        autoFocus
      />
      <input
        type="text"
        placeholder="リポジトリパス"
        value={repoPath}
        onChange={(event) => onRepoPathChange(event.target.value)}
        className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
        onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
      />
      {hosts.length > 0 && (
        <select
          value={sshHost}
          onChange={(event) => onSshHostChange(event.target.value)}
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary outline-none focus:border-accent"
        >
          <option value="">ローカル</option>
          {hosts.filter((host) => host.isConnected).map((host) => (
            <option key={host.name} value={host.name}>
              SSH: {host.name} ({host.user}@{host.hostname})
            </option>
          ))}
        </select>
      )}
      {projects.length > 0 && (
        <select
          value={projectId ?? ''}
          onChange={(event) => onProjectIdChange(event.target.value || null)}
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-border rounded text-text-primary outline-none focus:border-accent"
        >
          <option value="">プロジェクトなし</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      )}
      <button
        onClick={onSubmit}
        className="w-full px-2 py-1.5 text-xs bg-accent hover:bg-accent-hover text-surface-0 rounded transition-colors font-medium"
      >
        作成
      </button>
    </div>
  )
}

export function SidebarFavoritesSection({
  sessions,
  collapsed,
  favoritesOnly,
  onToggleCollapsed,
  onToggleFavoritesOnly,
  renderSession,
}: {
  sessions: Session[]
  collapsed: boolean
  favoritesOnly: boolean
  onToggleCollapsed: () => void
  onToggleFavoritesOnly: () => void
  renderSession: (session: Session, keyPrefix: string) => ReactNode
}) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <div>
      <div className="flex items-center">
        <button
          onClick={onToggleCollapsed}
          className="flex-1 text-left px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-2 transition-colors flex items-center gap-1"
        >
          <span className="text-[8px]">{collapsed ? '▶' : '▼'}</span>
          お気に入り
          <FavoriteBadge count={sessions.length} />
        </button>
        <button
          onClick={onToggleFavoritesOnly}
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
          {!collapsed && sessions.map((session) => (
            <motion.div
              key={`fav-${session.id}`}
              layout
              variants={disperseVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderSession(session, 'fav')}
            </motion.div>
          ))}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}

export function SidebarProjectManagerSection({
  collapsed,
  tabSyncing,
  tabSyncResult,
  showProjectForm,
  newProjectName,
  newProjectColor,
  onToggleCollapsed,
  onSync,
  onOpenProjectForm,
  onCloseProjectForm,
  onProjectNameChange,
  onProjectColorChange,
  onCreateProject,
}: {
  collapsed: boolean
  tabSyncing: boolean
  tabSyncResult: string | null
  showProjectForm: boolean
  newProjectName: string
  newProjectColor: string
  onToggleCollapsed: () => void
  onSync: () => void
  onOpenProjectForm: () => void
  onCloseProjectForm: () => void
  onProjectNameChange: (value: string) => void
  onProjectColorChange: (value: string) => void
  onCreateProject: () => void
}) {
  return (
    <div className="border-t border-border mt-1">
      <div className="flex items-center">
        <button
          onClick={onToggleCollapsed}
          className="flex-1 text-left px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-2 transition-colors flex items-center gap-1"
        >
          <span className="text-[8px]">{collapsed ? '▶' : '▼'}</span>
          プロジェクト管理
        </button>
      </div>
      {!collapsed && (
        <>
          <button
            onClick={onSync}
            disabled={tabSyncing}
            className="w-full text-left px-3 py-1.5 text-xs text-cyan-400 hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            {tabSyncing ? '同期中...' : 'tab同期'}
          </button>
          {tabSyncResult && (
            <p className="px-3 py-1 text-[10px] text-text-muted">{tabSyncResult}</p>
          )}

          {showProjectForm ? (
            <div className="px-3 py-2 space-y-2">
              <input
                type="text"
                placeholder="プロジェクト名"
                value={newProjectName}
                onChange={(event) => onProjectNameChange(event.target.value)}
                className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
                autoFocus
                onKeyDown={(event) => event.key === 'Enter' && onCreateProject()}
              />
              <div className="flex gap-1 flex-wrap">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => onProjectColorChange(color)}
                    className={`w-5 h-5 rounded-sm transition-transform ${
                      newProjectColor === color ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-1 scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={onCreateProject}
                  className="flex-1 px-2 py-1 text-xs bg-accent hover:bg-accent-hover text-surface-0 rounded transition-colors"
                >
                  作成
                </button>
                <button
                  onClick={onCloseProjectForm}
                  className="px-2 py-1 text-xs bg-surface-2 text-text-secondary hover:bg-surface-3 rounded transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenProjectForm}
              className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-surface-2 transition-colors"
            >
              + 新規プロジェクト
            </button>
          )}
        </>
      )}
    </div>
  )
}

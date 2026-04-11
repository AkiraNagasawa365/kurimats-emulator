import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, Session } from '@kurimats/shared'
import { PROJECT_COLORS } from '@kurimats/shared'
import { useSessionStore } from '../../stores/session-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useSshStore } from '../../stores/ssh-store'
import { tabApi } from '../../lib/api'
import { ProjectSettingsPanel } from '../project/ProjectSettingsPanel'
import {
  SidebarCreateSessionForm,
  SidebarFavoritesSection,
  SidebarProjectManagerSection,
  SidebarSessionItem,
  SidebarSshHostItem,
} from './sidebar/SidebarParts'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function Sidebar() {
  const {
    sessions,
    projects,
    createSession,
    toggleFavorite,
    assignProject,
    createProject,
    fetchProjects,
    fetchSessions,
    reconnectSession,
  } = useSessionStore()
  const { addPanel, setActiveSession, boardNodes } = useLayoutStore()
  const { hosts, fetchHosts, connectHost, disconnectHost, fetchPresets } = useSshStore()
  const tabSyncMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRepoPath, setNewRepoPath] = useState('')
  const [newProjectId, setNewProjectId] = useState<string | null>(null)
  const [newSshHost, setNewSshHost] = useState('')
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
  const [settingsProject, setSettingsProject] = useState<Project | null>(null)

  useEffect(() => {
    void fetchHosts()
    void fetchPresets()
  }, [fetchHosts, fetchPresets])

  useEffect(() => () => {
    if (tabSyncMessageTimerRef.current) {
      clearTimeout(tabSyncMessageTimerRef.current)
    }
  }, [])

  const favoriteSessions = useMemo(
    () => sessions.filter((session) => session.isFavorite),
    [sessions],
  )

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return sessions
    }

    const query = searchQuery.toLowerCase()
    return sessions.filter((session) =>
      session.name.toLowerCase().includes(query) ||
      session.branch?.toLowerCase().includes(query) ||
      session.repoPath.toLowerCase().includes(query),
    )
  }, [sessions, searchQuery])

  const sessionsByProject = useMemo(() => {
    const grouped = new Map<string, Session[]>()
    const unassigned: Session[] = []

    for (const session of filteredSessions) {
      if (!session.projectId) {
        unassigned.push(session)
        continue
      }

      const group = grouped.get(session.projectId) ?? []
      group.push(session)
      grouped.set(session.projectId, group)
    }

    return { grouped, unassigned }
  }, [filteredSessions])

  const getProjectColor = (projectId: string | null) =>
    projects.find((project) => project.id === projectId)?.color ?? null

  const handleSessionClick = (session: Session) => {
    const isOnBoard = boardNodes.some((node) => node.sessionId === session.id)
    if (isOnBoard) {
      setActiveSession(session.id)
      return
    }

    addPanel(session.id)
  }

  const handleReconnect = async (session: Session) => {
    try {
      await reconnectSession(session.id)
      handleSessionClick(session)
    } catch (error) {
      alert(`再接続エラー: ${toErrorMessage(error)}`)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newRepoPath.trim()) {
      return
    }

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
    } catch (error) {
      alert(`作成エラー: ${toErrorMessage(error)}`)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      return
    }

    try {
      await createProject({
        name: newProjectName.trim(),
        color: newProjectColor,
        repoPath: '',
      })
      setNewProjectName('')
      setNewProjectColor(PROJECT_COLORS[0])
      setShowProjectForm(false)
    } catch (error) {
      alert(`プロジェクト作成エラー: ${toErrorMessage(error)}`)
    }
  }

  const handleAddSessionToProject = async (project: Pick<Project, 'id' | 'name' | 'repoPath' | 'sshPresetId'>) => {
    if (creatingProjectId) {
      return
    }

    setCreatingProjectId(project.id)

    try {
      const siblings = sessions.filter((session) => session.projectId === project.id)
      const sessionName = siblings.length === 0 ? project.name : `${project.name}-${siblings.length + 1}`
      const preset = project.sshPresetId
        ? useSshStore.getState().presets.find((candidate) => candidate.id === project.sshPresetId)
        : null
      const sshHost = preset ? preset.name || preset.hostname : undefined

      const session = await createSession({
        name: sessionName,
        repoPath: project.repoPath,
        useWorktree: !sshHost,
        sshHost,
      })

      await assignProject(session.id, project.id)
      addPanel(session.id, siblings.map((sessionItem) => sessionItem.id))
    } catch (error) {
      alert(`セッション作成エラー: ${toErrorMessage(error)}`)
    } finally {
      setCreatingProjectId(null)
    }
  }

  const handleProjectClick = async (project: Project) => {
    if (creatingProjectId) {
      return
    }

    const existingSession = sessions.find((session) => session.projectId === project.id)
    if (existingSession) {
      handleSessionClick(existingSession)
      return
    }

    await handleAddSessionToProject(project)
  }

  const handleTabSync = async () => {
    setTabSyncing(true)
    setTabSyncResult(null)

    if (tabSyncMessageTimerRef.current) {
      clearTimeout(tabSyncMessageTimerRef.current)
    }

    try {
      const result = await tabApi.sync()
      await Promise.all([fetchProjects(), fetchSessions()])

      for (const session of result.sessions) {
        addPanel(session.id)
      }

      setTabSyncResult(`${result.created}件プロジェクト / ${result.sessions.length}件セッション作成`)
    } catch (error) {
      setTabSyncResult(`同期エラー: ${toErrorMessage(error)}`)
    } finally {
      setTabSyncing(false)
      tabSyncMessageTimerRef.current = setTimeout(() => {
        setTabSyncResult(null)
      }, 5000)
    }
  }

  const renderSessionItem = (session: Session, keyPrefix: string) => (
    <SidebarSessionItem
      key={`${keyPrefix}-${session.id}`}
      session={session}
      isOnBoard={boardNodes.some((node) => node.sessionId === session.id)}
      projectColor={getProjectColor(session.projectId)}
      onClick={() => handleSessionClick(session)}
      onToggleFavorite={() => void toggleFavorite(session.id)}
      onReconnect={session.status === 'disconnected' ? () => void handleReconnect(session) : undefined}
    />
  )

  return (
    <div className="w-60 bg-chrome border-r border-border flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-bold text-text-primary">Kurimats</h1>
        <button
          onClick={() => setShowNewForm((visible) => !visible)}
          className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors text-lg leading-none"
          title="新規セッション"
        >
          +
        </button>
      </div>

      <SidebarCreateSessionForm
        visible={showNewForm}
        name={newName}
        repoPath={newRepoPath}
        projectId={newProjectId}
        sshHost={newSshHost}
        projects={projects}
        hosts={hosts}
        onNameChange={setNewName}
        onRepoPathChange={setNewRepoPath}
        onProjectIdChange={setNewProjectId}
        onSshHostChange={setNewSshHost}
        onSubmit={() => void handleCreate()}
      />

      <div className="px-3 py-2 border-b border-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="セッションを検索..."
          className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <SidebarFavoritesSection
          sessions={favoriteSessions}
          collapsed={favoritesCollapsed}
          favoritesOnly={favoritesOnly}
          onToggleCollapsed={() => setFavoritesCollapsed((collapsed) => !collapsed)}
          onToggleFavoritesOnly={() => setFavoritesOnly((enabled) => !enabled)}
          renderSession={renderSessionItem}
        />

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
              {projects.map((project) => {
                const projectSessions = sessionsByProject.grouped.get(project.id)
                if (!projectSessions?.length) {
                  return null
                }

                return (
                  <div key={project.id} className="mb-1">
                    <div className="flex items-center px-3 py-1 hover:bg-surface-2 transition-colors group">
                      <span
                        className="w-2 h-2 rounded-sm flex-shrink-0 mr-1.5"
                        style={{ backgroundColor: project.color }}
                      />
                      <span
                        className="text-[10px] font-semibold text-text-secondary flex-1 truncate cursor-pointer"
                        onClick={() => void handleProjectClick(project)}
                      >
                        {project.name}
                        {project.sshPresetId && <span className="text-[8px] ml-1 text-blue-400">SSH</span>}
                        <span className="text-text-muted ml-1">{projectSessions.length}</span>
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          setSettingsProject(project)
                        }}
                        className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-secondary text-[10px] rounded hover:bg-surface-3 transition-colors opacity-0 group-hover:opacity-100"
                        title="プロジェクト設定"
                      >
                        ⚙
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleAddSessionToProject(project)
                        }}
                        className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-accent text-[10px] rounded hover:bg-surface-3 transition-colors"
                        title={`${project.name} に新規セッション追加`}
                      >
                        +
                      </button>
                    </div>

                    {projectSessions.map((session) =>
                      !favoritesOnly || session.isFavorite ? (
                        <div key={session.id} className="pl-3">
                          {renderSessionItem(session, `project-${project.id}`)}
                        </div>
                      ) : null,
                    )}
                  </div>
                )
              })}

              {sessionsByProject.unassigned.length > 0 && (
                <div className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-text-muted">
                    未割り当て
                    <span className="ml-1">{sessionsByProject.unassigned.length}</span>
                  </div>
                  {sessionsByProject.unassigned.map((session) =>
                    !favoritesOnly || session.isFavorite ? renderSessionItem(session, 'unassigned') : null,
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <SidebarProjectManagerSection
          collapsed={projectsCollapsed}
          tabSyncing={tabSyncing}
          tabSyncResult={tabSyncResult}
          showProjectForm={showProjectForm}
          newProjectName={newProjectName}
          newProjectColor={newProjectColor}
          onToggleCollapsed={() => setProjectsCollapsed((collapsed) => !collapsed)}
          onSync={() => void handleTabSync()}
          onOpenProjectForm={() => setShowProjectForm(true)}
          onCloseProjectForm={() => setShowProjectForm(false)}
          onProjectNameChange={setNewProjectName}
          onProjectColorChange={setNewProjectColor}
          onCreateProject={() => void handleCreateProject()}
        />
      </div>

      {hosts.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setSshCollapsed((collapsed) => !collapsed)}
            className="w-full text-left px-3 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-2 transition-colors flex items-center gap-1"
          >
            <span className="text-[8px]">{sshCollapsed ? '▶' : '▼'}</span>
            SSHホスト
            <span className="text-text-muted ml-auto">{hosts.length}</span>
          </button>
          {!sshCollapsed && hosts.map((host) => (
            <SidebarSshHostItem
              key={host.name}
              host={host}
              onConnect={() => {
                void connectHost(host.name).catch((error) => {
                  alert(`SSH接続エラー: ${toErrorMessage(error)}`)
                })
              }}
              onDisconnect={() => disconnectHost(host.name)}
            />
          ))}
        </div>
      )}

      <div className="px-3 py-2.5 border-t border-border">
        <p className="text-[10px] text-text-secondary font-medium">
          ボード: {boardNodes.length}件のセッション
        </p>
      </div>

      {settingsProject && (
        <ProjectSettingsPanel
          project={settingsProject}
          onClose={() => setSettingsProject(null)}
          onUpdated={() => void fetchProjects()}
        />
      )}
    </div>
  )
}

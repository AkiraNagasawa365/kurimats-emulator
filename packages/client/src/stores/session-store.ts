import { create } from 'zustand'
import type { Session, CreateSessionParams, Project, CreateProjectParams } from '@kurimats/shared'
import { sessionsApi, projectsApi } from '../lib/api'

interface SessionState {
  sessions: Session[]
  projects: Project[]
  loading: boolean
  error: string | null

  fetchSessions: () => Promise<void>
  createSession: (params: CreateSessionParams) => Promise<Session>
  /** 外部で作成済みのセッションをストアに追加（ペイン分割時等） */
  addSession: (session: Session) => void
  deleteSession: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  assignProject: (sessionId: string, projectId: string | null) => Promise<void>
  renameSession: (id: string, name: string) => Promise<void>

  reconnectSession: (id: string) => Promise<void>

  fetchProjects: () => Promise<void>
  createProject: (params: CreateProjectParams) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  projects: [],
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null })
    try {
      const sessions = await sessionsApi.list()
      set({ sessions, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  createSession: async (params) => {
    const session = await sessionsApi.create(params)
    set({ sessions: [session, ...get().sessions] })
    return session
  },

  addSession: (session) => {
    // 重複防止
    if (get().sessions.some(s => s.id === session.id)) return
    set({ sessions: [session, ...get().sessions] })
  },

  deleteSession: async (id) => {
    await sessionsApi.delete(id)
    set({ sessions: get().sessions.filter(s => s.id !== id) })
  },

  toggleFavorite: async (id) => {
    try {
      const { isFavorite } = await sessionsApi.toggleFavorite(id)
      set({
        sessions: get().sessions.map(s =>
          s.id === id ? { ...s, isFavorite } : s
        ),
      })
    } catch (e) {
      console.error('お気に入り切り替えエラー:', e)
    }
  },

  assignProject: async (sessionId, projectId) => {
    try {
      await sessionsApi.assignProject(sessionId, projectId)
      set({
        sessions: get().sessions.map(s =>
          s.id === sessionId ? { ...s, projectId } : s
        ),
      })
    } catch (e) {
      console.error('プロジェクト割り当てエラー:', e)
    }
  },

  renameSession: async (id, name) => {
    try {
      const { session } = await sessionsApi.rename(id, name)
      set({
        sessions: get().sessions.map(s =>
          s.id === id ? session : s
        ),
      })
    } catch (e) {
      console.error('セッション名変更エラー:', e)
    }
  },

  reconnectSession: async (id) => {
    try {
      const { session } = await sessionsApi.reconnect(id)
      set({
        sessions: get().sessions.map(s =>
          s.id === id ? session : s
        ),
      })
    } catch (e) {
      console.error('セッション再接続エラー:', e)
      throw e
    }
  },

  fetchProjects: async () => {
    try {
      const projects = await projectsApi.list()
      set({ projects })
    } catch (e) {
      console.error('プロジェクト取得エラー:', e)
    }
  },

  createProject: async (params) => {
    const project = await projectsApi.create(params)
    set({ projects: [...get().projects, project] })
    return project
  },

  deleteProject: async (id) => {
    await projectsApi.delete(id)
    set({ projects: get().projects.filter(p => p.id !== id) })
  },
}))

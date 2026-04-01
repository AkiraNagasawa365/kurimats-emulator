import { create } from 'zustand'
import type { Session, CreateSessionParams } from '@kurimats/shared'
import { sessionsApi } from '../lib/api'

interface SessionState {
  sessions: Session[]
  loading: boolean
  error: string | null

  fetchSessions: () => Promise<void>
  createSession: (params: CreateSessionParams) => Promise<Session>
  deleteSession: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
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

  deleteSession: async (id) => {
    await sessionsApi.delete(id)
    set({ sessions: get().sessions.filter(s => s.id !== id) })
  },
}))

import { create } from 'zustand'
import type { SshHost, SshConnectionStatus, ClaudeNotification } from '@kurimats/shared'
import { sshApi } from '../lib/api'

interface SshState {
  hosts: SshHost[]
  statuses: Record<string, SshConnectionStatus>
  notifications: ClaudeNotification[]
  loading: boolean
  error: string | null

  fetchHosts: () => Promise<void>
  connectHost: (hostName: string) => Promise<void>
  disconnectHost: (hostName: string) => Promise<void>
  fetchStatuses: () => Promise<void>
  refreshHosts: () => Promise<void>

  // 通知管理
  addNotification: (notification: ClaudeNotification) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void

  // WebSocketからの状態更新
  updateConnectionStatus: (host: string, status: SshConnectionStatus) => void
}

export const useSshStore = create<SshState>((set, get) => ({
  hosts: [],
  statuses: {},
  notifications: [],
  loading: false,
  error: null,

  fetchHosts: async () => {
    set({ loading: true, error: null })
    try {
      const hosts = await sshApi.hosts()
      set({ hosts, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  connectHost: async (hostName) => {
    try {
      await sshApi.connect(hostName)
      // ホスト一覧を更新
      const hosts = await sshApi.hosts()
      set({ hosts })
    } catch (e) {
      set({ error: `SSH接続エラー: ${e}` })
      throw e
    }
  },

  disconnectHost: async (hostName) => {
    try {
      await sshApi.disconnect(hostName)
      const hosts = await sshApi.hosts()
      set({ hosts })
    } catch (e) {
      set({ error: `SSH切断エラー: ${e}` })
    }
  },

  fetchStatuses: async () => {
    try {
      const statuses = await sshApi.status()
      set({ statuses })
    } catch (e) {
      console.error('SSH状態取得エラー:', e)
    }
  },

  refreshHosts: async () => {
    try {
      const hosts = await sshApi.refresh()
      set({ hosts })
    } catch (e) {
      set({ error: `SSH設定更新エラー: ${e}` })
    }
  },

  addNotification: (notification) => {
    set({ notifications: [notification, ...get().notifications].slice(0, 50) })
  },

  markNotificationRead: (id) => {
    set({
      notifications: get().notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      ),
    })
  },

  clearNotifications: () => {
    set({ notifications: [] })
  },

  updateConnectionStatus: (host, status) => {
    set({
      statuses: { ...get().statuses, [host]: status },
      hosts: get().hosts.map(h =>
        h.name === host ? { ...h, isConnected: status === 'online' } : h
      ),
    })
  },
}))

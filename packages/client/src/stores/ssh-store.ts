import { create } from 'zustand'
import type { SshHost, SshConnectionStatus, ClaudeNotification, SshPreset, CreateSshPresetParams, StartupTemplate, CreateStartupTemplateParams } from '@kurimats/shared'
import { sshApi } from '../lib/api'

interface SshState {
  hosts: SshHost[]
  statuses: Record<string, SshConnectionStatus>
  notifications: ClaudeNotification[]
  presets: SshPreset[]
  templates: StartupTemplate[]
  loading: boolean
  error: string | null

  fetchHosts: () => Promise<void>
  connectHost: (hostName: string) => Promise<void>
  disconnectHost: (hostName: string) => Promise<void>
  fetchStatuses: () => Promise<void>
  refreshHosts: () => Promise<void>

  // SSHプリセット管理
  fetchPresets: () => Promise<void>
  createPreset: (params: CreateSshPresetParams) => Promise<SshPreset>
  updatePreset: (id: string, params: Partial<CreateSshPresetParams>) => Promise<void>
  deletePreset: (id: string) => Promise<void>

  // 起動テンプレート管理
  fetchTemplates: () => Promise<void>
  createTemplate: (params: CreateStartupTemplateParams) => Promise<StartupTemplate>
  deleteTemplate: (id: string) => Promise<void>

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
  presets: [],
  templates: [],
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

  // SSHプリセット管理
  fetchPresets: async () => {
    try {
      const presets = await sshApi.presets.list()
      set({ presets })
    } catch (e) {
      console.error('SSHプリセット取得エラー:', e)
    }
  },

  createPreset: async (params) => {
    const preset = await sshApi.presets.create(params)
    set({ presets: [preset, ...get().presets] })
    return preset
  },

  updatePreset: async (id, params) => {
    const updated = await sshApi.presets.update(id, params)
    set({ presets: get().presets.map(p => p.id === id ? updated : p) })
  },

  deletePreset: async (id) => {
    await sshApi.presets.delete(id)
    set({ presets: get().presets.filter(p => p.id !== id) })
  },

  // 起動テンプレート管理
  fetchTemplates: async () => {
    try {
      const templates = await sshApi.templates.list()
      set({ templates })
    } catch (e) {
      console.error('起動テンプレート取得エラー:', e)
    }
  },

  createTemplate: async (params) => {
    const template = await sshApi.templates.create(params)
    set({ templates: [template, ...get().templates] })
    return template
  },

  deleteTemplate: async (id) => {
    await sshApi.templates.delete(id)
    set({ templates: get().templates.filter(t => t.id !== id) })
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

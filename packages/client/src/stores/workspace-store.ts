import { create } from 'zustand'
import type { CmuxWorkspace, CreateCmuxWorkspaceParams, PaneNode } from '@kurimats/shared'
import { workspacesApi } from '../lib/api'

interface WorkspaceState {
  workspaces: CmuxWorkspace[]
  activeWorkspaceId: string | null
  /** 表示順序（ピン留め優先 + 通知順） */
  workspaceOrder: string[]
  loading: boolean
  error: string | null

  // CRUD
  fetchWorkspaces: () => Promise<void>
  createWorkspace: (params: CreateCmuxWorkspaceParams) => Promise<CmuxWorkspace>
  deleteWorkspace: (id: string) => Promise<void>
  switchWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => Promise<void>

  // ピン留め
  togglePin: (id: string) => Promise<void>

  // ペインツリー更新
  updatePaneTree: (workspaceId: string, tree: PaneNode, activePaneId: string) => void

  // 通知管理
  incrementNotification: (workspaceId: string) => void
  clearNotifications: (workspaceId: string) => void
  reorderByNotifications: () => void

  // 永続化
  persistLayout: (workspaceId: string) => Promise<void>
}

/** 通知順にワークスペースをソート（ピン留め済みは上部固定） */
function sortWorkspaceOrder(workspaces: CmuxWorkspace[]): string[] {
  const pinned = workspaces.filter(w => w.isPinned)
  const unpinned = [...workspaces.filter(w => !w.isPinned)]

  // 未ピンは通知あり→通知時刻降順→作成時刻降順
  unpinned.sort((a, b) => {
    const aHas = a.notificationCount > 0 ? 1 : 0
    const bHas = b.notificationCount > 0 ? 1 : 0
    if (aHas !== bHas) return bHas - aHas
    if (a.lastNotifiedAt !== b.lastNotifiedAt) {
      return (b.lastNotifiedAt ?? 0) - (a.lastNotifiedAt ?? 0)
    }
    return b.createdAt - a.createdAt
  })

  return [...pinned.map(w => w.id), ...unpinned.map(w => w.id)]
}

/** デバウンス用タイマー */
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  workspaceOrder: [],
  loading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ loading: true, error: null })
    try {
      const workspaces = await workspacesApi.list()
      const order = sortWorkspaceOrder(workspaces)
      set({
        workspaces,
        workspaceOrder: order,
        activeWorkspaceId: get().activeWorkspaceId ?? order[0] ?? null,
        loading: false,
      })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  createWorkspace: async (params) => {
    try {
      const workspace = await workspacesApi.create(params)
      const newWorkspaces = [workspace, ...get().workspaces]
      set({
        workspaces: newWorkspaces,
        workspaceOrder: sortWorkspaceOrder(newWorkspaces),
        activeWorkspaceId: workspace.id,
      })
      return workspace
    } catch (e: unknown) {
      // 重複エラー: 既存WSに切り替え
      const msg = String(e)
      if (msg.includes('既に存在')) {
        const existingWs = get().workspaces.find(w =>
          w.repoPath === params.repoPath && (w.sshHost ?? null) === (params.sshHost ?? null),
        )
        if (existingWs) {
          set({ activeWorkspaceId: existingWs.id })
          return existingWs
        }
      }
      throw e
    }
  },

  deleteWorkspace: async (id) => {
    await workspacesApi.delete(id)
    const newWorkspaces = get().workspaces.filter(w => w.id !== id)
    const newOrder = sortWorkspaceOrder(newWorkspaces)
    const active = get().activeWorkspaceId === id ? (newOrder[0] ?? null) : get().activeWorkspaceId
    set({
      workspaces: newWorkspaces,
      workspaceOrder: newOrder,
      activeWorkspaceId: active,
    })
  },

  switchWorkspace: (id) => {
    set({ activeWorkspaceId: id })
  },

  renameWorkspace: async (id, name) => {
    try {
      const updated = await workspacesApi.rename(id, name)
      set({
        workspaces: get().workspaces.map(w => w.id === id ? updated : w),
      })
    } catch (e) {
      console.error('ワークスペース名変更エラー:', e)
    }
  },

  togglePin: async (id) => {
    try {
      const updated = await workspacesApi.togglePin(id)
      const newWorkspaces = get().workspaces.map(w => w.id === id ? updated : w)
      set({
        workspaces: newWorkspaces,
        workspaceOrder: sortWorkspaceOrder(newWorkspaces),
      })
    } catch (e) {
      console.error('ピン留め切り替えエラー:', e)
    }
  },

  updatePaneTree: (workspaceId, tree, activePaneId) => {
    set({
      workspaces: get().workspaces.map(w =>
        w.id === workspaceId
          ? { ...w, paneTree: tree, activePaneId }
          : w,
      ),
    })

    // デバウンス付き永続化
    const existing = persistTimers.get(workspaceId)
    if (existing) clearTimeout(existing)
    persistTimers.set(workspaceId, setTimeout(() => {
      get().persistLayout(workspaceId)
      persistTimers.delete(workspaceId)
    }, 1000))
  },

  incrementNotification: (workspaceId) => {
    const now = Date.now()
    const newWorkspaces = get().workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, notificationCount: w.notificationCount + 1, lastNotifiedAt: now }
        : w,
    )
    set({
      workspaces: newWorkspaces,
      workspaceOrder: sortWorkspaceOrder(newWorkspaces),
    })
  },

  clearNotifications: (workspaceId) => {
    const newWorkspaces = get().workspaces.map(w =>
      w.id === workspaceId ? { ...w, notificationCount: 0 } : w,
    )
    set({
      workspaces: newWorkspaces,
      workspaceOrder: sortWorkspaceOrder(newWorkspaces),
    })
  },

  reorderByNotifications: () => {
    set({ workspaceOrder: sortWorkspaceOrder(get().workspaces) })
  },

  persistLayout: async (workspaceId) => {
    const workspace = get().workspaces.find(w => w.id === workspaceId)
    if (!workspace) return
    try {
      await workspacesApi.updatePaneTree(workspaceId, workspace.paneTree, workspace.activePaneId)
    } catch (e) {
      console.error('レイアウト永続化エラー:', e)
    }
  },
}))

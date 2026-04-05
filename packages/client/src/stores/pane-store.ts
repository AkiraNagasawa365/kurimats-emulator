import { create } from 'zustand'
import type { SplitDirection, Surface } from '@kurimats/shared'
import {
  resizeSplit,
  addSurface as addSurfaceToTree,
  removeSurface as removeSurfaceFromTree,
  switchSurface as switchSurfaceInTree,
  findAdjacentPane,
} from '../lib/pane-tree-utils'
import { useWorkspaceStore } from './workspace-store'
import { workspacesApi } from '../lib/api'

type Direction = 'up' | 'down' | 'left' | 'right'

interface PaneState {
  /** ズーム中のペインID（nullなら通常表示） */
  zoomedPaneId: string | null
  /** 通知リング状態: paneId → active */
  attentionRings: Map<string, boolean>

  // ペイン操作（アクティブワークスペースのツリーを操作）
  splitPane: (paneId: string, direction: SplitDirection, opts?: { sshHost?: string; repoPath?: string }) => Promise<void>
  closePane: (paneId: string) => Promise<void>
  zoomPane: (paneId: string) => void
  unzoom: () => void
  toggleZoom: (paneId: string) => void
  resizeSplit: (splitId: string, ratio: number) => void
  focusPane: (paneId: string) => void
  focusDirection: (direction: Direction) => void

  // サーフェス操作
  addSurface: (paneId: string, surface: Surface) => void
  removeSurface: (paneId: string, surfaceId: string) => void
  switchSurface: (paneId: string, index: number) => void

  // 通知リング
  setAttentionRing: (paneId: string, active: boolean) => void
  clearAllRings: () => void
}

/** アクティブワークスペースのペインツリーを取得・更新するヘルパー */
function withActiveWorkspace(
  callback: (workspace: { paneTree: import('@kurimats/shared').PaneNode; activePaneId: string; id: string }) => {
    tree: import('@kurimats/shared').PaneNode
    activePaneId: string
  } | null,
) {
  const wsStore = useWorkspaceStore.getState()
  const workspace = wsStore.workspaces.find(w => w.id === wsStore.activeWorkspaceId)
  if (!workspace) return

  const result = callback(workspace)
  if (!result) return

  wsStore.updatePaneTree(workspace.id, result.tree, result.activePaneId)
}

export const usePaneStore = create<PaneState>((set, get) => ({
  zoomedPaneId: null,
  attentionRings: new Map(),

  splitPane: async (paneId, direction, opts) => {
    const wsStore = useWorkspaceStore.getState()
    const workspace = wsStore.workspaces.find(w => w.id === wsStore.activeWorkspaceId)
    if (!workspace) return

    try {
      // サーバーAPIで新セッション+worktree+Claude Code起動
      const result = await workspacesApi.splitPane(workspace.id, { paneId, direction, ...opts })
      // サーバーが返した新しいペインツリーをストアに反映
      wsStore.updatePaneTree(workspace.id, result.paneTree, result.activePaneId)
    } catch (e) {
      console.error('ペイン分割エラー:', e)
    }
  },

  closePane: async (paneId) => {
    const wsStore = useWorkspaceStore.getState()
    const workspace = wsStore.workspaces.find(w => w.id === wsStore.activeWorkspaceId)
    if (!workspace) return

    try {
      // サーバーAPIでセッション/PTY/worktreeも連動削除
      const result = await workspacesApi.closePane(workspace.id, { paneId })
      // サーバーが返した新しいペインツリーをストアに反映
      wsStore.updatePaneTree(workspace.id, result.paneTree, result.activePaneId)
    } catch (e) {
      console.error('ペイン閉じエラー:', e)
    }

    // ズーム中のペインが閉じられたらアンズーム
    if (get().zoomedPaneId === paneId) {
      set({ zoomedPaneId: null })
    }
  },

  zoomPane: (paneId) => {
    set({ zoomedPaneId: paneId })
  },

  unzoom: () => {
    set({ zoomedPaneId: null })
  },

  toggleZoom: (paneId) => {
    if (get().zoomedPaneId === paneId) {
      set({ zoomedPaneId: null })
    } else {
      set({ zoomedPaneId: paneId })
    }
  },

  resizeSplit: (splitId, ratio) => {
    withActiveWorkspace((ws) => ({
      tree: resizeSplit(ws.paneTree, splitId, ratio),
      activePaneId: ws.activePaneId,
    }))
  },

  focusPane: (paneId) => {
    withActiveWorkspace((ws) => ({
      tree: ws.paneTree,
      activePaneId: paneId,
    }))

    // フォーカスしたペインの通知リングを消去
    const rings = new Map(get().attentionRings)
    if (rings.has(paneId)) {
      rings.delete(paneId)
      set({ attentionRings: rings })
    }
  },

  focusDirection: (direction) => {
    const wsStore = useWorkspaceStore.getState()
    const workspace = wsStore.workspaces.find(w => w.id === wsStore.activeWorkspaceId)
    if (!workspace) return

    const target = findAdjacentPane(workspace.paneTree, workspace.activePaneId, direction)
    if (target) {
      get().focusPane(target.id)
    }
  },

  addSurface: (paneId, surface) => {
    withActiveWorkspace((ws) => ({
      tree: addSurfaceToTree(ws.paneTree, paneId, surface),
      activePaneId: ws.activePaneId,
    }))
  },

  removeSurface: (paneId, surfaceId) => {
    withActiveWorkspace((ws) => ({
      tree: removeSurfaceFromTree(ws.paneTree, paneId, surfaceId),
      activePaneId: ws.activePaneId,
    }))
  },

  switchSurface: (paneId, index) => {
    withActiveWorkspace((ws) => ({
      tree: switchSurfaceInTree(ws.paneTree, paneId, index),
      activePaneId: ws.activePaneId,
    }))
  },

  setAttentionRing: (paneId, active) => {
    const rings = new Map(get().attentionRings)
    if (active) {
      rings.set(paneId, true)
    } else {
      rings.delete(paneId)
    }
    set({ attentionRings: rings })
  },

  clearAllRings: () => {
    set({ attentionRings: new Map() })
  },
}))

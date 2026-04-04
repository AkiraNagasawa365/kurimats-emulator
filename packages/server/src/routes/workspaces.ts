import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { PaneNode } from '@kurimats/shared'

/** デフォルトのペインツリー（空の1ペイン） */
function createDefaultPaneTree(): PaneNode {
  return {
    kind: 'leaf',
    id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    surfaces: [],
    activeSurfaceIndex: 0,
    ratio: 0.5,
  }
}

export function createWorkspacesRouter(store: SessionStore): Router {
  const router = Router()

  // 全ワークスペース取得
  router.get('/', (_req, res) => {
    const workspaces = store.getAllCmuxWorkspaces()
    res.json(workspaces)
  })

  // ワークスペース取得
  router.get('/:id', (req, res) => {
    const workspace = store.getCmuxWorkspace(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  // ワークスペース作成
  router.post('/', (req, res) => {
    const { name, projectId, repoPath, sshHost } = req.body
    if (!name) {
      res.status(400).json({ error: '名前は必須です' })
      return
    }

    const paneTree = createDefaultPaneTree()
    const workspace = store.createCmuxWorkspace(
      { name, projectId, repoPath, sshHost },
      paneTree,
    )
    res.status(201).json(workspace)
  })

  // ワークスペース名変更
  router.patch('/:id', (req, res) => {
    const { name } = req.body
    if (!name) {
      res.status(400).json({ error: '名前は必須です' })
      return
    }
    const workspace = store.renameCmuxWorkspace(req.params.id, name)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  // ピン留めトグル
  router.post('/:id/pin', (req, res) => {
    const workspace = store.toggleCmuxWorkspacePin(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  // ペインツリー更新
  router.put('/:id/pane-tree', (req, res) => {
    const { paneTree, activePaneId } = req.body as { paneTree: PaneNode; activePaneId: string }
    if (!paneTree || !activePaneId) {
      res.status(400).json({ error: 'paneTree と activePaneId は必須です' })
      return
    }
    store.updateCmuxPaneTree(req.params.id, paneTree, activePaneId)
    res.json({ ok: true })
  })

  // ワークスペース削除
  router.delete('/:id', (req, res) => {
    const deleted = store.deleteCmuxWorkspace(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json({ ok: true })
  })

  return router
}

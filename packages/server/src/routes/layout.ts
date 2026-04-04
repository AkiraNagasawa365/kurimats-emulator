import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { CanvasStore } from '../services/canvas-store.js'
import type { LayoutState, BoardLayoutState, CreateWorkspaceParams, BoardNodePosition, FileTilePosition, BoardEdge } from '@kurimats/shared'

export function createLayoutRouter(store: SessionStore, canvasStore?: CanvasStore): Router {
  const router = Router()

  // レイアウト取得
  router.get('/', (_req, res) => {
    const layout = store.getLayout()
    res.json(layout)
  })

  // レイアウト保存
  router.put('/', (req, res) => {
    const state = req.body as LayoutState
    store.saveLayout(state)
    res.json({ ok: true })
  })

  // ボードレイアウト取得（JSONファイル優先、フォールバックでSQLite）
  router.get('/board', (_req, res) => {
    if (canvasStore) {
      const layout = canvasStore.load()
      if (layout) {
        res.json(layout)
        return
      }
    }
    // フォールバック: SQLiteから読み込み（既存データの互換性維持）
    const layout = store.getBoardLayout()
    res.json(layout)
  })

  // ボードレイアウト保存（JSONファイル優先）
  router.put('/board', (req, res) => {
    const state = req.body as BoardLayoutState
    if (canvasStore) {
      canvasStore.save(state)
    }
    // SQLiteにもバックアップ保存
    store.saveBoardLayout(state)
    res.json({ ok: true })
  })

  // ==================== ワークスペース ====================

  /** ワークスペース一覧 */
  router.get('/workspaces', (_req, res) => {
    res.json(store.getAllWorkspaces())
  })

  /** ワークスペース保存（現在のキャンバス状態をスナップショット） */
  router.post('/workspaces', (req, res) => {
    const { name, boardNodes, fileTiles, edges, viewport } = req.body as CreateWorkspaceParams & {
      boardNodes: unknown[]; fileTiles: unknown[]; edges: unknown[]; viewport: { x: number; y: number; zoom: number }
    }
    if (!name) {
      res.status(400).json({ error: 'name は必須です' })
      return
    }
    const workspace = store.createWorkspace(
      { name },
      (boardNodes || []) as BoardNodePosition[],
      (fileTiles || []) as FileTilePosition[],
      (edges || []) as BoardEdge[],
      viewport || { x: 0, y: 0, zoom: 1 },
    )
    res.status(201).json(workspace)
  })

  /** ワークスペース取得 */
  router.get('/workspaces/:id', (req, res) => {
    const workspace = store.getWorkspace(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  /** ワークスペース削除 */
  router.delete('/workspaces/:id', (req, res) => {
    const deleted = store.deleteWorkspace(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json({ ok: true })
  })

  return router
}

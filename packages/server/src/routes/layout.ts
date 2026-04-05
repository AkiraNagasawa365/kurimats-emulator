import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { CanvasStore } from '../services/canvas-store.js'
import type { LayoutState, BoardLayoutState } from '@kurimats/shared'

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

  return router
}

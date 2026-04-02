import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { LayoutState, BoardLayoutState } from '@kurimats/shared'

export function createLayoutRouter(store: SessionStore): Router {
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

  // ボードレイアウト取得
  router.get('/board', (_req, res) => {
    const layout = store.getBoardLayout()
    res.json(layout)
  })

  // ボードレイアウト保存
  router.put('/board', (req, res) => {
    const state = req.body as BoardLayoutState
    store.saveBoardLayout(state)
    res.json({ ok: true })
  })

  return router
}

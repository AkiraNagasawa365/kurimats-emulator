import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { CreateFeedbackParams, FeedbackCategory, FeedbackPriority } from '@kurimats/shared'

const VALID_CATEGORIES: FeedbackCategory[] = ['feature_request', 'bug_report', 'improvement']
const VALID_PRIORITIES: FeedbackPriority[] = ['high', 'medium', 'low']

export function createFeedbackRouter(store: SessionStore): Router {
  const router = Router()

  // フィードバック一覧取得
  router.get('/', (_req, res) => {
    const feedback = store.getAllFeedback()
    res.json(feedback)
  })

  // フィードバック作成
  router.post('/', (req, res) => {
    const params = req.body as CreateFeedbackParams

    if (!params.title?.trim()) {
      res.status(400).json({ error: 'タイトルは必須です' })
      return
    }

    if (!VALID_CATEGORIES.includes(params.category)) {
      res.status(400).json({ error: '無効なカテゴリです' })
      return
    }

    if (!VALID_PRIORITIES.includes(params.priority)) {
      res.status(400).json({ error: '無効な優先度です' })
      return
    }

    const feedback = store.createFeedback({
      title: params.title.trim(),
      detail: params.detail?.trim() || '',
      category: params.category,
      priority: params.priority,
    })

    res.status(201).json(feedback)
  })

  // フィードバック削除
  router.delete('/:id', (req, res) => {
    const deleted = store.deleteFeedback(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'フィードバックが見つかりません' })
      return
    }
    res.json({ ok: true })
  })

  return router
}

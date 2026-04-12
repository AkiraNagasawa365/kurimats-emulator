/**
 * Resource HUD REST API ルート
 *
 * GET /api/resources              — 全体スナップショット
 * GET /api/resources/:instanceId  — 特定インスタンスのメトリクス
 * POST /api/resources/collect     — 即座に収集を実行
 */
import { Router } from 'express'
import type { ResourceMonitorService } from '../services/resource-monitor.js'

export function createResourcesRouter(
  monitor: ResourceMonitorService,
): Router {
  const router = Router()

  // 全体スナップショット
  router.get('/', (_req, res) => {
    const snapshot = monitor.getLastSnapshot()
    if (!snapshot) {
      res.json({ server: null, instances: [], wsConnectionCount: 0, collectedAt: null })
      return
    }
    res.json(snapshot)
  })

  // 特定インスタンスのメトリクス
  router.get('/:instanceId', (req, res) => {
    const metrics = monitor.getInstanceMetrics(req.params.instanceId)
    if (!metrics) {
      res.status(404).json({ error: 'メトリクスが見つかりません' })
      return
    }
    res.json(metrics)
  })

  // 即座に収集を実行
  router.post('/collect', async (_req, res) => {
    try {
      const snapshot = await monitor.collect()
      res.json(snapshot)
    } catch (e) {
      res.status(500).json({ error: `メトリクス収集に失敗: ${e}` })
    }
  })

  return router
}

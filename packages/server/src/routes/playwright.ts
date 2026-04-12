/**
 * Playwright Runner REST API ルート
 *
 * POST   /api/playwright/run            — テスト実行指示
 * GET    /api/playwright/status/:id     — 実行状態取得
 * DELETE /api/playwright/run/:id        — 実行中止
 * GET    /api/playwright/results        — 全結果取得
 * POST   /api/playwright/clear          — 完了済み結果クリア
 */
import { Router } from 'express'
import type { PlaywrightRunner } from '../services/playwright-runner.js'
import type { DevInstanceManager } from '../services/dev-instance-manager.js'

export function createPlaywrightRouter(
  runner: PlaywrightRunner,
  devInstanceManager: DevInstanceManager,
): Router {
  const router = Router()

  // テスト実行指示
  router.post('/run', (req, res) => {
    const { instanceId, testPath, cwd } = req.body as {
      instanceId?: string
      testPath?: string
      cwd?: string
    }

    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId は文字列で必須です' })
      return
    }
    if (testPath !== undefined && typeof testPath !== 'string') {
      res.status(400).json({ error: 'testPath は文字列で指定してください' })
      return
    }
    if (cwd !== undefined && typeof cwd !== 'string') {
      res.status(400).json({ error: 'cwd は文字列で指定してください' })
      return
    }

    const instance = devInstanceManager.getInstanceById(instanceId)
    if (!instance) {
      res.status(404).json({ error: `DevInstance ${instanceId} が見つかりません` })
      return
    }

    // cwd が指定されていなければ DevInstance の worktreePath または process.cwd() を使用
    const effectiveCwd = cwd || instance.worktreePath || process.cwd()

    try {
      const result = runner.run(instanceId, instance.slotNumber, effectiveCwd, testPath)
      res.status(201).json(result)
    } catch (e) {
      res.status(409).json({ error: `${e}` })
    }
  })

  // 実行状態取得
  router.get('/status/:id', (req, res) => {
    const result = runner.getResult(req.params.id)
    if (!result) {
      res.json({ instanceId: req.params.id, status: 'idle' })
      return
    }
    res.json(result)
  })

  // 実行中止
  router.delete('/run/:id', (req, res) => {
    const result = runner.getResult(req.params.id)
    if (!result || result.status !== 'running') {
      res.status(400).json({ error: '実行中のテストがありません' })
      return
    }

    runner.stop(req.params.id)
    res.json({ ok: true, instanceId: req.params.id })
  })

  // 全結果取得
  router.get('/results', (_req, res) => {
    res.json(runner.getAllResults())
  })

  // 完了済み結果クリア
  router.post('/clear', (_req, res) => {
    runner.clearFinished()
    res.json({ ok: true })
  })

  return router
}

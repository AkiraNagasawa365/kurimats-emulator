import { Router } from 'express'
import type { WorktreeService } from '../services/worktree-service.js'

export function createWorktreesRouter(worktreeService: WorktreeService): Router {
  const router = Router()

  // Worktree一覧
  router.get('/', (req, res) => {
    const repoPath = req.query.repo as string
    if (!repoPath) {
      res.status(400).json({ error: 'repo パラメータが必要です' })
      return
    }
    const worktrees = worktreeService.list(repoPath)
    res.json(worktrees)
  })

  // Worktree作成
  router.post('/', (req, res) => {
    const { repoPath, name, baseBranch } = req.body as {
      repoPath: string
      name: string
      baseBranch?: string
    }

    if (!repoPath || !name) {
      res.status(400).json({ error: 'repoPath と name が必要です' })
      return
    }

    try {
      const worktreePath = worktreeService.create(repoPath, name, baseBranch)
      res.status(201).json({ path: worktreePath })
    } catch (e) {
      res.status(500).json({ error: `Worktree作成エラー: ${e}` })
    }
  })

  // Worktree削除
  router.delete('/', (req, res) => {
    const { repoPath, worktreePath } = req.body as {
      repoPath: string
      worktreePath: string
    }

    try {
      worktreeService.remove(repoPath, worktreePath)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: `Worktree削除エラー: ${e}` })
    }
  })

  return router
}

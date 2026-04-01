import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { PtyManager } from '../services/pty-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { CreateSessionParams } from '@kurimats/shared'

export function createSessionsRouter(
  store: SessionStore,
  ptyManager: PtyManager,
  worktreeService: WorktreeService
): Router {
  const router = Router()

  // セッション一覧
  router.get('/', (_req, res) => {
    const sessions = store.getAll()
    res.json(sessions)
  })

  // セッション作成
  router.post('/', (req, res) => {
    const params = req.body as CreateSessionParams

    if (!params.name || !params.repoPath) {
      res.status(400).json({ error: 'name と repoPath は必須です' })
      return
    }

    let worktreePath: string | null = null

    // worktreeを使用する場合（デフォルト有効）
    if (params.useWorktree !== false && worktreeService.isGitRepo(params.repoPath)) {
      try {
        worktreePath = worktreeService.create(
          params.repoPath,
          params.name.replace(/\s+/g, '-').toLowerCase(),
          params.baseBranch
        )
      } catch (e) {
        console.error('Worktree作成エラー:', e)
        // worktree作成失敗時はrepoPathをそのまま使用
      }
    }

    const session = store.create({
      ...params,
      worktreePath,
    })

    // PTYを起動（worktreeがあればそのパス、なければrepoPath）
    const cwd = worktreePath || params.repoPath
    try {
      ptyManager.spawn(session.id, cwd)
    } catch (e) {
      store.delete(session.id)
      res.status(500).json({ error: `PTY起動エラー: ${e}` })
      return
    }

    res.status(201).json(session)
  })

  // セッション取得
  router.get('/:id', (req, res) => {
    const session = store.getById(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'セッションが見つかりません' })
      return
    }
    res.json(session)
  })

  // セッション終了
  router.delete('/:id', (req, res) => {
    const session = store.getById(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'セッションが見つかりません' })
      return
    }

    ptyManager.kill(session.id)
    store.updateStatus(session.id, 'terminated')
    res.json({ ok: true })
  })

  // お気に入りトグル
  router.post('/:id/favorite', (req, res) => {
    const isFavorite = store.toggleFavorite(req.params.id)
    res.json({ isFavorite })
  })

  // プロジェクト割り当て
  router.post('/:id/project', (req, res) => {
    const { projectId } = req.body as { projectId: string | null }
    store.assignProject(req.params.id, projectId)
    res.json({ ok: true })
  })

  return router
}

import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { PtyManager } from '../services/pty-manager.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { CreateSessionParams } from '@kurimats/shared'

export function createSessionsRouter(
  store: SessionStore,
  ptyManager: PtyManager,
  sshManager: SshManager,
  worktreeService: WorktreeService
): Router {
  const router = Router()

  // セッション一覧
  router.get('/', (_req, res) => {
    const sessions = store.getAll()
    res.json(sessions)
  })

  // セッション作成
  router.post('/', async (req, res) => {
    const params = req.body as CreateSessionParams

    if (!params.name || !params.repoPath) {
      res.status(400).json({ error: 'name と repoPath は必須です' })
      return
    }

    const isRemote = !!params.sshHost

    let worktreePath: string | null = null

    // ローカルセッションの場合のみworktreeを使用
    if (!isRemote && params.useWorktree !== false && worktreeService.isGitRepo(params.repoPath)) {
      try {
        worktreePath = worktreeService.create(
          params.repoPath,
          params.name.replace(/\s+/g, '-').toLowerCase(),
          params.baseBranch
        )
      } catch (e) {
        console.error('Worktree作成エラー:', e)
      }
    }

    const session = store.create({
      name: params.name,
      repoPath: params.repoPath,
      baseBranch: params.baseBranch,
      useWorktree: params.useWorktree,
      worktreePath,
      sshHost: params.sshHost || null,
      isRemote,
    })

    const cwd = worktreePath || params.repoPath

    try {
      if (isRemote && params.sshHost) {
        // リモートSSHセッション: SshManager経由で接続・シェル起動
        await sshManager.connect(params.sshHost)
        await sshManager.spawn(session.id, params.sshHost, cwd, 120, 30)
      } else {
        // ローカルPTYセッション: シェルを起動
        const shell = process.env.SHELL || '/bin/zsh'
        await ptyManager.spawn(session.id, cwd, 120, 30, shell, [])
      }
    } catch (e) {
      console.error(`${isRemote ? 'SSH接続/リモートシェル' : 'PTY'}起動エラー:`, e)
      try {
        store.delete(session.id)
      } catch (deleteErr) {
        console.error('セッション削除エラー:', deleteErr)
      }
      res.status(500).json({ error: `${isRemote ? 'SSH接続/リモートシェル' : 'PTY'}起動エラー: ${e}` })
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

    // リモートセッションはSshManager、ローカルはPtyManagerで終了
    if (sshManager.hasSession(session.id)) {
      sshManager.kill(session.id)
    } else {
      ptyManager.kill(session.id)
    }
    store.delete(session.id)
    res.json({ ok: true })
  })

  // お気に入りトグル
  router.post('/:id/favorite', (req, res) => {
    const isFavorite = store.toggleFavorite(req.params.id)
    res.json({ isFavorite })
  })

  // ターミナルプレビュー取得（最新出力の数行）
  router.get('/:id/preview', (req, res) => {
    const session = store.getById(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'セッションが見つかりません' })
      return
    }

    const lines = parseInt(req.query.lines as string) || 5
    const buffer = sshManager.hasSession(session.id)
      ? sshManager.getBuffer(session.id)
      : ptyManager.getBuffer(session.id)

    // ANSIエスケープシーケンスを除去して最新行を取得
    const cleanBuffer = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
    const allLines = cleanBuffer.split('\n').filter(l => l.trim().length > 0)
    const previewLines = allLines.slice(-lines)

    res.json({ sessionId: session.id, lines: previewLines })
  })

  // プロジェクト割り当て
  router.post('/:id/project', (req, res) => {
    const { projectId } = req.body as { projectId: string | null }
    store.assignProject(req.params.id, projectId)
    res.json({ ok: true })
  })

  return router
}

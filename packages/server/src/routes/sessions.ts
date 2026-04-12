import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import { type PtyManager } from '../services/pty-manager.js'
import { type SshManager } from '../services/ssh-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { CreateSessionParams } from '@kurimats/shared'
import { createAndSpawnSession, cleanupSession, waitForShellReady } from '../services/session-lifecycle.js'

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

    try {
      const session = await createAndSpawnSession(
        store, ptyManager, sshManager, worktreeService,
        {
          name: params.name,
          repoPath: params.repoPath,
          sshHost: params.sshHost,
          useWorktree: params.useWorktree,
          baseBranch: params.baseBranch,
        },
      )
      res.status(201).json(session)
    } catch (e) {
      const isRemote = !!params.sshHost
      res.status(500).json({ error: `${isRemote ? 'SSH接続/リモートシェル' : 'PTY'}起動エラー: ${e}` })
    }
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
  router.delete('/:id', async (req, res) => {
    const session = store.getById(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'セッションが見つかりません' })
      return
    }

    try {
      await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)
      res.json({ ok: true })
    } catch (e) {
      console.error(`セッション終了エラー "${session.name}":`, e)
      res.status(500).json({ error: `セッション終了に失敗: ${e}` })
    }
  })

  // セッション再接続（PTY再spawn）
  router.post('/:id/reconnect', async (req, res) => {
    const session = store.getById(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'セッションが見つかりません' })
      return
    }

    if (session.status !== 'disconnected') {
      res.status(400).json({ error: '再接続はdisconnectedセッションのみ可能です' })
      return
    }

    const cwd = session.worktreePath || session.repoPath

    try {
      if (session.isRemote && session.sshHost) {
        await sshManager.connect(session.sshHost)
        await sshManager.spawn(session.id, session.sshHost, cwd, 120, 30)
        waitForShellReady(session.id, ptyManager, sshManager, true, true)
      } else {
        if (ptyManager.backend === 'node-pty') {
          const shell = process.env.SHELL || '/bin/zsh'
          await ptyManager.spawn(session.id, cwd, 120, 30, shell, [])
          waitForShellReady(session.id, ptyManager, sshManager, false, true)
        } else {
          await ptyManager.spawn(session.id, cwd, 120, 30, 'claude', ['--dangerously-skip-permissions', '--continue'])
        }
      }

      store.updateStatus(session.id, 'active')

      // worktreeがある場合、現在のブランチ名を最新化
      if (session.worktreePath) {
        const currentBranch = worktreeService.getBranch(session.worktreePath)
        if (currentBranch && currentBranch !== session.branch) {
          store.updateBranch(session.id, currentBranch)
          console.log(`🌿 ブランチ更新: ${session.branch} → ${currentBranch}`)
        }
      }

      console.log(`🔄 セッション "${session.name}" (${session.id.slice(0, 8)}...) を再接続しました`)
      res.json({ ok: true, session: store.getById(session.id) })
    } catch (e) {
      console.error(`セッション再接続エラー "${session.name}":`, e)
      res.status(500).json({ error: `再接続エラー: ${e}` })
    }
  })

  // セッション名変更
  router.patch('/:id', (req, res) => {
    const session = store.getById(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'セッションが見つかりません' })
      return
    }
    const { name } = req.body as { name?: string }
    if (!name || !name.trim()) {
      res.status(400).json({ error: '名前は必須です' })
      return
    }
    store.rename(session.id, name.trim())
    res.json({ ok: true, session: store.getById(session.id) })
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
    const cleanBuffer = buffer
      .replace(/\x1b\[[?>=<]*[0-9;]*[a-zA-Z]/g, '')  // CSI: 標準 + プライベートモード (\x1b[?2026h 等)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')  // OSC: \x1b]...\x07 or \x1b]...\x1b\\
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')  // DCS/SOS/PM/APC
      .replace(/\x1b[()][A-Z0-9]/g, '')  // 文字セット指定
      .replace(/\x1b[#%][0-9A-Z]/g, '')  // その他2バイトシーケンス
      .replace(/[\x00-\x08\x0e-\x1f]/g, '')  // 制御文字（タブ・改行以外）
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

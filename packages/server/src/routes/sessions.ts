import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import { type PtyManager } from '../services/pty-manager.js'
import { type SshManager } from '../services/ssh-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { CreateSessionParams } from '@kurimats/shared'

/**
 * シェルの初期化完了を検出してclaudeコマンドを送信する
 * シェルのプロンプト出力（$ や % や > の末尾文字）を監視し、
 * 表示されたらclaudeを実行する。最大5秒のタイムアウト付き。
 */
function waitForShellReady(
  sessionId: string,
  ptyManager: PtyManager,
  sshManager: SshManager,
  isRemote: boolean,
): void {
  const manager = isRemote ? sshManager : ptyManager
  let resolved = false

  const onData = (_sid: string, data: string) => {
    if (_sid !== sessionId || resolved) return
    // シェルプロンプトの一般的なパターン（$ % > #）を検出
    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (cleanData.match(/[$%>#]\s*$/) || cleanData.includes('❯')) {
      resolved = true
      manager.removeListener('data', onData)
      // プロンプト検出後、少し待ってからclaudeを送信
      setTimeout(() => {
        if (isRemote) {
          sshManager.write(sessionId, 'claude\r')
        } else {
          ptyManager.write(sessionId, 'claude\r')
        }
      }, 100)
    }
  }

  manager.on('data', onData)

  // タイムアウト: 5秒以内にプロンプトが検出されなければ強制送信
  setTimeout(() => {
    if (!resolved) {
      resolved = true
      manager.removeListener('data', onData)
      console.warn(`⚠️ セッション ${sessionId.slice(0, 8)}... のシェルプロンプト検出タイムアウト。claudeを強制送信します。`)
      if (isRemote) {
        sshManager.write(sessionId, 'claude\r')
      } else {
        ptyManager.write(sessionId, 'claude\r')
      }
    }
  }, 5000)
}

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
        // リモートでもclaude起動（シェル出力を監視して準備完了後に実行）
        waitForShellReady(session.id, ptyManager, sshManager, true)
      } else {
        // ローカルPTYセッション: シェルを起動し、claudeを自動実行
        const shell = process.env.SHELL || '/bin/zsh'
        await ptyManager.spawn(session.id, cwd, 120, 30, shell, [])
        // シェル出力を監視して準備完了後にclaudeを実行
        waitForShellReady(session.id, ptyManager, sshManager, false)
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

    // worktreeのクリーンアップ
    if (session.worktreePath && session.repoPath) {
      try {
        worktreeService.remove(session.repoPath, session.worktreePath)
        console.log(`🗑️ worktree削除: ${session.worktreePath}`)
      } catch (e) {
        console.warn(`worktree削除エラー (無視): ${e}`)
      }
    }

    store.delete(session.id)
    res.json({ ok: true })
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
        waitForShellReady(session.id, ptyManager, sshManager, true)
      } else {
        const shell = process.env.SHELL || '/bin/zsh'
        await ptyManager.spawn(session.id, cwd, 120, 30, shell, [])
        waitForShellReady(session.id, ptyManager, sshManager, false)
      }

      store.updateStatus(session.id, 'active')
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

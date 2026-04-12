/**
 * セッションライフサイクル管理
 * セッション作成+PTY/SSH起動+Claude起動、およびクリーンアップの共通ロジック
 */
import type { Session } from '@kurimats/shared'
import type { SessionStore } from './session-store.js'
import type { PtyManager } from './pty-manager.js'
import type { SshManager } from './ssh-manager.js'
import { WorktreeService } from './worktree-service.js'

/**
 * シェルの初期化完了を検出してclaude --continueコマンドを送信する
 * シェルのプロンプト出力（$ や % や > の末尾文字）を監視し、
 * 表示されたらclaude --continueを実行する。最大5秒のタイムアウト付き。
 * --continueにより、前回の会話履歴がある場合は自動復元される。
 */
/**
 * @param continueSession trueの場合 `claude --continue`、falseの場合 `claude` を実行
 */
export function waitForShellReady(
  sessionId: string,
  ptyManager: PtyManager,
  sshManager: SshManager,
  isRemote: boolean,
  continueSession = false,
): void {
  const manager = isRemote ? sshManager : ptyManager
  let resolved = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const claudeCmd = continueSession ? 'claude --continue\r' : 'claude\r'

  const cleanup = () => {
    manager.removeListener('data', onData)
    manager.removeListener('exit', onExit)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const launchClaude = () => {
    cleanup()
    if (isRemote) {
      sshManager.write(sessionId, claudeCmd)
    } else {
      ptyManager.write(sessionId, claudeCmd)
    }
  }

  const onData = (_sid: string, data: string) => {
    if (_sid !== sessionId || resolved) return
    // シェルプロンプトの一般的なパターン（$ % > #）を検出
    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (cleanData.match(/[$%>#]\s*$/) || cleanData.includes('❯')) {
      resolved = true
      // プロンプト検出後、少し待ってからclaudeを送信
      timeoutId = setTimeout(launchClaude, 100)
    }
  }

  const onExit = (_sid: string) => {
    if (_sid !== sessionId || resolved) return
    resolved = true
    cleanup()
  }

  manager.on('data', onData)
  manager.on('exit', onExit)

  // タイムアウト: 5秒以内にプロンプトが検出されなければ強制送信
  timeoutId = setTimeout(() => {
    if (!resolved) {
      resolved = true
      console.warn(`⚠️ セッション ${sessionId.slice(0, 8)}... のシェルプロンプト検出タイムアウト。claudeを強制送信します。`)
      launchClaude()
    }
  }, 5000)
}

/** セッション作成パラメータ */
export interface CreateAndSpawnParams {
  name: string
  repoPath: string
  sshHost?: string | null
  useWorktree?: boolean
  baseBranch?: string
  workspaceId?: string | null
  projectId?: string | null
  /** trueの場合、シェル起動後にclaude --continueを自動実行する */
  launchClaude?: boolean
}

/**
 * セッション作成 + worktree作成 + PTY/SSH起動 + Claude自動起動
 * sessions.ts / workspaces.ts / tab.ts で共通利用
 */
export async function createAndSpawnSession(
  store: SessionStore,
  ptyManager: PtyManager,
  sshManager: SshManager,
  worktreeService: WorktreeService,
  params: CreateAndSpawnParams,
): Promise<Session> {
  const isRemote = !!params.sshHost
  const launchClaude = params.launchClaude !== false // デフォルトtrue

  // ワークツリー作成（ローカルセッションのみ）
  let worktreePath: string | null = null
  if (!isRemote && params.useWorktree !== false && worktreeService.isGitRepo(params.repoPath)) {
    try {
      const wtName = params.name.replace(/\s+/g, '-').toLowerCase()
      worktreePath = worktreeService.create(
        params.repoPath,
        wtName,
        params.baseBranch,
      )
      console.log(`📁 ワークツリー作成: ${worktreePath}`)
    } catch (e) {
      console.warn(`⚠️ ワークツリー作成スキップ: ${e}`)
    }
  }

  // worktree作成後は実際のブランチ名を取得（baseBranchは作成元であり実ブランチではない）
  const actualBranch = worktreePath
    ? worktreeService.getBranch(worktreePath) ?? params.baseBranch
    : params.baseBranch

  // セッション作成（DB保存）
  const session = store.create({
    name: params.name,
    repoPath: params.repoPath,
    baseBranch: actualBranch,
    useWorktree: params.useWorktree,
    worktreePath,
    sshHost: params.sshHost ?? null,
    isRemote,
    workspaceId: params.workspaceId ?? null,
    projectId: params.projectId ?? null,
  })

  const cwd = worktreePath || params.repoPath

  // PTY/SSH起動
  try {
    await ptyManager.initialize()

    if (isRemote && params.sshHost) {
      // SSH経由
      await sshManager.connect(params.sshHost)
      await sshManager.spawn(session.id, params.sshHost, cwd, 120, 30)
      if (launchClaude) {
        waitForShellReady(session.id, ptyManager, sshManager, true)
      }
    } else {
      // ローカルPTY
      if (ptyManager.backend === 'node-pty') {
        const shell = process.env.SHELL || '/bin/zsh'
        await ptyManager.spawn(session.id, cwd, 120, 30, shell, [])
        if (launchClaude) {
          waitForShellReady(session.id, ptyManager, sshManager, false)
        }
      } else {
        // child_processモード: claude --continueを直接起動
        await ptyManager.spawn(session.id, cwd, 120, 30, 'claude', ['--continue'])
      }
    }
  } catch (e) {
    console.error(`PTY/SSH起動エラー:`, e)
    // クリーンアップ: プロセス終了
    if (sshManager.hasSession(session.id)) {
      sshManager.kill(session.id)
    } else {
      ptyManager.kill(session.id)
    }
    // クリーンアップ: DB削除
    try { store.delete(session.id) } catch { /* セッション削除失敗は無視 */ }
    // クリーンアップ: worktree削除
    if (worktreePath) {
      try {
        worktreeService.remove(params.repoPath, worktreePath)
      } catch { /* worktree削除失敗は無視 */ }
    }
    throw e
  }

  return session
}

/**
 * セッションのPTY/SSH kill + worktree削除 + DB削除（非同期版）
 *
 * ステート遷移:
 * - status → 'cleaning' → worktree 削除試行
 *   - 成功: DB から完全削除
 *   - 失敗: status → 'tombstone'（次回起動時に retry）
 *
 * workspaces.ts / sessions.ts で共通利用
 */
export async function cleanupSession(
  store: SessionStore,
  ptyManager: PtyManager,
  sshManager: SshManager,
  worktreeService: WorktreeService,
  sessionId: string,
): Promise<void> {
  const session = store.getById(sessionId)
  if (!session) return

  // cleaning 状態に遷移
  store.updateStatus(sessionId, 'cleaning')

  // PTY/SSH kill
  if (sshManager.hasSession(sessionId)) {
    sshManager.kill(sessionId)
  } else {
    ptyManager.kill(sessionId)
  }

  // persistent develop worktree はセッション削除時に worktree を残す
  const isPersistent = session.worktreePath
    ? WorktreeService.isPersistentDevelop(session.worktreePath)
    : false

  // worktree削除（persistent 以外）
  if (session.worktreePath && session.repoPath && !isPersistent) {
    try {
      worktreeService.remove(session.repoPath, session.worktreePath)
      console.log(`🗑️ worktree削除: ${session.worktreePath}`)
    } catch (e) {
      console.warn(`⚠️ worktree削除失敗 → tombstone に遷移: ${e}`)
      store.updateStatus(sessionId, 'tombstone')
      return
    }
  }

  // DB削除
  store.delete(sessionId)
}

/**
 * tombstone セッションの cleanup を再試行する
 * startup.ts から呼ばれる
 */
export function retryTombstoneCleanup(
  store: SessionStore,
  worktreeService: WorktreeService,
): void {
  const tombstones = store.getAll().filter(s => s.status === 'tombstone')
  if (tombstones.length === 0) return

  console.log(`🔄 ${tombstones.length}件の tombstone セッションの cleanup を再試行します`)
  for (const session of tombstones) {
    const isPersistent = session.worktreePath
      ? WorktreeService.isPersistentDevelop(session.worktreePath)
      : false

    if (session.worktreePath && session.repoPath && !isPersistent) {
      try {
        worktreeService.remove(session.repoPath, session.worktreePath)
        console.log(`   🗑️ tombstone worktree 削除成功: ${session.worktreePath}`)
      } catch (e) {
        console.warn(`   ⚠️ tombstone worktree 削除再失敗 (残留): ${e}`)
        continue // 削除失敗は tombstone のまま残す
      }
    }

    store.delete(session.id)
    console.log(`   ✅ tombstone セッション "${session.name}" (${session.id.slice(0, 8)}...) を削除`)
  }
}

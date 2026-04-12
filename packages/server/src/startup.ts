/**
 * サーバー起動時の初期化タスク
 * - 段階0: ペインツリーマイグレーション（非破壊、常時実行）
 * - 段階1: orphanedセッション(active)をdisconnectedに変更
 * - 段階2: disconnectedセッションのworktree+ブランチを削除してDB更新
 * - 段階3: ペインツリーに含まれない孤立セッションを削除
 * - 段階4: git worktree prune + 孤立kurimats/ブランチの一括削除
 * - 段階5: worktreeセッションのブランチ名を最新化（非破壊、常時実行）
 *
 * StartupGuard: cwdがworktree内の場合は段階1-4をスキップし自爆を防止
 */
import { realpathSync } from 'fs'
import { existsSync } from 'fs'
import path from 'path'
import type { PaneNode } from '@kurimats/shared'
import type { SessionStore } from './services/session-store.js'
import type { WorktreeService } from './services/worktree-service.js'
import { collectSessionIds } from './utils/pane-tree.js'

/** StartupGuard の判定結果 */
export type StartupGuardVerdict = 'inside' | 'outside' | 'unknown'

/** StartupOptions: テスト容易性のために cwd を注入可能 */
export interface StartupOptions {
  cwd?: string
}

/**
 * 現在の cwd が自身の管理する worktree 内かどうかを判定する
 *
 * - 'inside': cwd が既知の worktreePath 配下にある → 破壊的操作をスキップ
 * - 'outside': cwd はどの worktree にも含まれない → 通常通り全段階実行
 * - 'unknown': 判定不能（realpathSync 例外、DB例外等） → fail-safe でスキップ
 */
export function resolveSelfWorktreeVerdict(
  sessionStore: SessionStore,
  options?: StartupOptions,
): StartupGuardVerdict {
  // cwd を正規化（realpathSync でシンボリックリンクを解決、失敗時は path.resolve にフォールバック）
  const rawCwd = options?.cwd ?? process.cwd()
  let cwdReal: string
  try {
    cwdReal = realpathSync(rawCwd)
  } catch {
    cwdReal = path.resolve(rawCwd)
  }

  let sessions: ReturnType<SessionStore['getAll']>
  try {
    sessions = sessionStore.getAll()
  } catch {
    return 'unknown'
  }

  // 各セッションの worktreePath を正規化して cwd が配下か判定
  for (const session of sessions) {
    if (!session.worktreePath) continue
    let wtReal: string
    try {
      wtReal = realpathSync(session.worktreePath)
    } catch {
      wtReal = path.resolve(session.worktreePath)
    }
    const rel = path.relative(wtReal, cwdReal)
    // rel が '..' で始まらず、絶対パスでもなければ cwd は worktree 配下
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return 'inside'
    }
  }

  // フォールバック: cwd パスセグメントに .kurimats-worktrees を含むか
  const segments = cwdReal.split(path.sep)
  if (segments.includes('.kurimats-worktrees')) {
    return 'inside'
  }

  return 'outside'
}

/**
 * 旧surfaces形式のペインツリーをsessionId形式にマイグレーションする
 * surfaces[].type === 'terminal' の target を sessionId に変換
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migratePaneTree(node: any): PaneNode {
  if (!node) return node
  if (node.kind === 'leaf') {
    // 旧形式: surfaces[] + activeSurfaceIndex → 新形式: sessionId
    if ('surfaces' in node && !('sessionId' in node)) {
      const terminalSurface = node.surfaces?.find((s: any) => s.type === 'terminal')
      const sessionId = terminalSurface?.target ?? ''
      return {
        kind: 'leaf',
        id: node.id,
        sessionId,
        ratio: node.ratio ?? 0.5,
      } as PaneNode
    }
    return node
  }
  if (node.kind === 'split' && node.children) {
    return {
      ...node,
      children: [migratePaneTree(node.children[0]), migratePaneTree(node.children[1])],
    } as PaneNode
  }
  return node
}

// ── 段階関数 ──────────────────────────────────────────

/** 段階0: ペインツリーの旧形式(surfaces[])から新形式(sessionId)へマイグレーション（非破壊） */
function phase0_migratePaneTrees(sessionStore: SessionStore): void {
  try {
    const workspaces = sessionStore.getAllCmuxWorkspaces()
    let migratedCount = 0
    for (const ws of workspaces) {
      const tree = ws.paneTree as any
      const needsMigration = JSON.stringify(tree).includes('"surfaces"')
      if (needsMigration) {
        const migrated = migratePaneTree(tree)
        sessionStore.updateCmuxPaneTree(ws.id, migrated, ws.activePaneId)
        migratedCount++
      }
    }
    if (migratedCount > 0) {
      console.log(`🔄 ${migratedCount}件のワークスペースのペインツリーをマイグレーションしました`)
    }
  } catch (e) {
    console.error('⚠️ ペインツリーマイグレーション中にエラー（サーバー起動は続行）:', e)
  }
}

/** 段階1: PTYが消失したactiveセッションをdisconnectedに変更 */
function phase1_markOrphanedDisconnected(sessionStore: SessionStore): void {
  const orphanedSessions = sessionStore.getAll().filter(s => s.status === 'active')
  if (orphanedSessions.length > 0) {
    console.log(`⚠️  ${orphanedSessions.length}件のorphanedセッションを検出 → disconnectedに変更`)
    for (const s of orphanedSessions) {
      sessionStore.updateStatus(s.id, 'disconnected')
      console.log(`   ↳ セッション "${s.name}" (${s.id.slice(0, 8)}...) → disconnected`)
    }
    console.log('✅ orphanedセッションの復元処理完了。UIから再接続可能です。')
  } else {
    console.log('✅ orphanedセッションなし')
  }
}

/** 段階2: disconnectedセッションのworktreeをクリーンアップ */
function phase2_cleanupDisconnectedWorktrees(sessionStore: SessionStore, worktreeService: WorktreeService): void {
  try {
    const disconnectedSessions = sessionStore.getAll().filter(s => s.status === 'disconnected' && s.worktreePath)
    if (disconnectedSessions.length > 0) {
      console.log(`🧹 ${disconnectedSessions.length}件のdisconnectedセッションのworktreeを解放`)
      for (const s of disconnectedSessions) {
        if (s.worktreePath && s.repoPath) {
          try {
            worktreeService.remove(s.repoPath, s.worktreePath)
            console.log(`   🗑️ worktree+ブランチ削除: ${s.worktreePath}`)
          } catch {
            // 既に削除済みの場合は無視
          }
          sessionStore.updateWorktreePath(s.id, null)
        }
      }
      console.log('✅ disconnectedセッションのworktree解放完了')
    }
  } catch (e) {
    console.error('⚠️ disconnectedセッションworktree解放中にエラー（サーバー起動は続行）:', e)
  }
}

/** 段階3: ペインツリーに含まれない孤立セッションを削除 */
function phase3_deleteOrphanedSessions(sessionStore: SessionStore, worktreeService: WorktreeService): void {
  try {
    const workspaces = sessionStore.getAllCmuxWorkspaces()
    const referencedIds = new Set<string>()
    for (const ws of workspaces) {
      for (const id of collectSessionIds(ws.paneTree)) {
        referencedIds.add(id)
      }
    }

    const allSessions = sessionStore.getAll()
    const orphanedCleanup = allSessions.filter(s => s.workspaceId && !referencedIds.has(s.id))
    if (orphanedCleanup.length > 0) {
      console.log(`🧹 ${orphanedCleanup.length}件の孤立セッションを削除します`)
      for (const s of orphanedCleanup) {
        if (s.worktreePath && s.repoPath) {
          try {
            worktreeService.remove(s.repoPath, s.worktreePath)
            console.log(`   🗑️ worktree+ブランチ削除: ${s.worktreePath}`)
          } catch {
            // 既に削除済みの場合は無視
          }
        }
        sessionStore.delete(s.id)
        console.log(`   ↳ セッション "${s.name}" (${s.id.slice(0, 8)}...) を削除`)
      }
      console.log('✅ 孤立セッション削除完了')
    } else {
      console.log('✅ 孤立セッションなし')
    }
  } catch (e) {
    console.error('⚠️ 孤立セッション削除中にエラー（サーバー起動は続行）:', e)
  }
}

/** 段階4: git worktree prune + 孤立kurimats/ブランチの一括削除 */
function phase4_pruneWorktreesAndBranches(sessionStore: SessionStore, worktreeService: WorktreeService): void {
  try {
    const allSessions = sessionStore.getAll()
    const repoPathsWithWorktrees = new Set(
      allSessions
        .filter(s => s.repoPath && s.worktreePath)
        .map(s => s.repoPath),
    )
    for (const s of allSessions) {
      if (s.repoPath && existsSync(`${s.repoPath}/.kurimats-worktrees`)) {
        repoPathsWithWorktrees.add(s.repoPath)
      }
    }

    for (const repoPath of repoPathsWithWorktrees) {
      try {
        worktreeService.prune(repoPath)
        const deleted = worktreeService.cleanupOrphanedBranches(repoPath)
        if (deleted.length > 0) {
          console.log(`🌿 ${repoPath}: ${deleted.length}件の孤立ブランチを削除`)
          for (const branch of deleted) {
            console.log(`   ↳ ${branch}`)
          }
        }
      } catch {
        // リポジトリアクセスエラーは無視（リモートリポジトリ等）
      }
    }
  } catch (e) {
    console.error('⚠️ orphanedブランチ削除中にエラー（サーバー起動は続行）:', e)
  }
}

/** 段階5: worktreeセッションのブランチ名を最新化（非破壊） */
function phase5_syncBranchNames(sessionStore: SessionStore, worktreeService: WorktreeService): void {
  try {
    const allSessionsForBranch = sessionStore.getAll()
    let branchFixCount = 0
    for (const s of allSessionsForBranch) {
      if (s.worktreePath) {
        const currentBranch = worktreeService.getBranch(s.worktreePath)
        if (currentBranch && currentBranch !== s.branch) {
          sessionStore.updateBranch(s.id, currentBranch)
          console.log(`   🌿 ブランチ修正: "${s.name}" ${s.branch} → ${currentBranch}`)
          branchFixCount++
        }
      }
    }
    if (branchFixCount > 0) {
      console.log(`✅ ${branchFixCount}件のセッションブランチを修正`)
    }
  } catch (e) {
    console.error('⚠️ ブランチ修正中にエラー（サーバー起動は続行）:', e)
  }
}

// ── メインエントリポイント ────────────────────────────

export function runStartupTasks(
  sessionStore: SessionStore,
  worktreeService: WorktreeService,
  options?: StartupOptions,
): void {
  // StartupGuard: cwd が worktree 内かどうかを判定
  const verdict = resolveSelfWorktreeVerdict(sessionStore, options)
  const skipDestructive = verdict === 'inside' || verdict === 'unknown'

  if (skipDestructive) {
    console.warn(
      `⚠️ StartupGuard verdict=${verdict}: 破壊的段階1-4をスキップします (fail-safe)`,
    )
  }

  // 段階0: ペインツリーマイグレーション（非破壊、常時実行）
  phase0_migratePaneTrees(sessionStore)

  if (!skipDestructive) {
    // 段階1: orphaned active → disconnected
    phase1_markOrphanedDisconnected(sessionStore)

    // 段階2: disconnected worktree 削除
    phase2_cleanupDisconnectedWorktrees(sessionStore, worktreeService)

    // 段階3: ペインツリー外セッション削除
    phase3_deleteOrphanedSessions(sessionStore, worktreeService)

    // 段階4: git worktree prune + orphaned branch 削除
    phase4_pruneWorktreesAndBranches(sessionStore, worktreeService)
  }

  // 段階5: ブランチ名修正（非破壊、常時実行）
  phase5_syncBranchNames(sessionStore, worktreeService)
}

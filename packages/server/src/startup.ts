/**
 * サーバー起動時の初期化タスク
 * - orphanedセッションをdisconnectedに変更
 * - ペインツリーに含まれない孤立セッションを削除
 * - worktreeセッションのブランチ名を最新化
 */
import type { SessionStore } from './services/session-store.js'
import type { WorktreeService } from './services/worktree-service.js'
import { collectSessionIds } from './utils/pane-tree.js'

export function runStartupTasks(sessionStore: SessionStore, worktreeService: WorktreeService): void {
  // 1. PTYが消失したactiveセッションをdisconnectedに変更
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

  // 2. ペインツリーに含まれない孤立セッションを削除
  try {
    const workspaces = sessionStore.getAllCmuxWorkspaces()
    const referencedIds = new Set<string>()
    for (const ws of workspaces) {
      for (const id of collectSessionIds(ws.paneTree)) {
        referencedIds.add(id)
      }
    }

    // workspace_id が NULL のセッション（単体セッション）は孤立とみなさない
    const allSessions = sessionStore.getAll()
    const orphanedCleanup = allSessions.filter(s => s.workspaceId && !referencedIds.has(s.id))
    if (orphanedCleanup.length > 0) {
      console.log(`🧹 ${orphanedCleanup.length}件の孤立セッションを削除します`)
      for (const s of orphanedCleanup) {
        if (s.worktreePath && s.repoPath) {
          try {
            worktreeService.remove(s.repoPath, s.worktreePath)
            console.log(`   🗑️ worktree削除: ${s.worktreePath}`)
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

  // 3. worktreeセッションのブランチ名を最新化
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

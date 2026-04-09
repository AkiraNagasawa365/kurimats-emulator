/**
 * サーバー起動時の初期化タスク
 * - orphanedセッション(active)をdisconnectedに変更
 * - disconnectedセッションのworktree+ブランチを削除してDB更新
 * - ペインツリーに含まれない孤立セッションを削除
 * - git worktree pruneで物理的な孤立worktreeを除去
 * - 孤立したkurimats/ブランチを一括削除
 * - worktreeセッションのブランチ名を最新化
 */
import { existsSync } from 'fs'
import type { PaneNode } from '@kurimats/shared'
import type { SessionStore } from './services/session-store.js'
import type { WorktreeService } from './services/worktree-service.js'
import { collectSessionIds } from './utils/pane-tree.js'

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

export function runStartupTasks(sessionStore: SessionStore, worktreeService: WorktreeService): void {
  // 0. ペインツリーの旧形式(surfaces[])から新形式(sessionId)へマイグレーション
  try {
    const workspaces = sessionStore.getAllCmuxWorkspaces()
    let migratedCount = 0
    for (const ws of workspaces) {
      const tree = ws.paneTree as any
      // 旧形式の判定: リーフノードに surfaces プロパティがある
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

  // 2. disconnectedセッションのworktreeをクリーンアップ
  //    アプリ再起動後のdisconnectedは実質再接続不可能なのでworktreeを解放する
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
          // worktreePathをnullに更新（セッション自体は再接続可能なまま保持）
          sessionStore.updateWorktreePath(s.id, null)
        }
      }
      console.log('✅ disconnectedセッションのworktree解放完了')
    }
  } catch (e) {
    console.error('⚠️ disconnectedセッションworktree解放中にエラー（サーバー起動は続行）:', e)
  }

  // 3. ペインツリーに含まれない孤立セッションを削除
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

  // 4. git worktree prune + 孤立kurimats/ブランチの一括削除
  try {
    const allSessions = sessionStore.getAll()
    const repoPathsWithWorktrees = new Set(
      allSessions
        .filter(s => s.repoPath && s.worktreePath)
        .map(s => s.repoPath),
    )
    // 過去にworktreeが存在した可能性があるリポジトリも対象に含める
    // （全セッションのrepoPathのうち .kurimats-worktrees ディレクトリが存在するもの）
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

  // 5. worktreeセッションのブランチ名を最新化
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

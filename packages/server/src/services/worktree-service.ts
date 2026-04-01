import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import type { WorktreeInfo } from '@kurimats/shared'

const WORKTREE_DIR = '.kurimats-worktrees'

/**
 * Git Worktree管理サービス
 * セッションごとに隔離されたworktreeを作成・管理する
 */
export class WorktreeService {
  /**
   * 新しいworktreeを作成
   */
  create(repoPath: string, name: string, baseBranch = 'main'): string {
    const worktreeBase = path.join(repoPath, WORKTREE_DIR)
    const worktreePath = path.join(worktreeBase, name)

    if (existsSync(worktreePath)) {
      return worktreePath
    }

    // worktreeディレクトリがなければ作成
    execSync(`mkdir -p "${worktreeBase}"`, { cwd: repoPath })

    // gitignoreに追加（まだなければ）
    const gitignorePath = path.join(repoPath, '.gitignore')
    if (existsSync(gitignorePath)) {
      const content = execSync(`cat "${gitignorePath}"`, { encoding: 'utf-8' })
      if (!content.includes(WORKTREE_DIR)) {
        execSync(`echo "\n${WORKTREE_DIR}/" >> "${gitignorePath}"`)
      }
    }

    try {
      execSync(
        `git worktree add "${worktreePath}" -b "kurimats/${name}" "${baseBranch}"`,
        { cwd: repoPath, encoding: 'utf-8', stdio: 'pipe' }
      )
    } catch {
      // ブランチが既に存在する場合、ブランチなしで追加
      execSync(
        `git worktree add "${worktreePath}" "kurimats/${name}"`,
        { cwd: repoPath, encoding: 'utf-8', stdio: 'pipe' }
      )
    }

    return worktreePath
  }

  /**
   * worktree一覧を取得
   */
  list(repoPath: string): WorktreeInfo[] {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      const worktrees: WorktreeInfo[] = []
      let current: Partial<WorktreeInfo> = {}

      for (const line of output.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as WorktreeInfo)
          current = { path: line.slice(9), isMain: false }
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice(5)
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).replace('refs/heads/', '')
        } else if (line === 'bare' || line === '') {
          if (current.path) {
            current.isMain = !current.path.includes(WORKTREE_DIR)
            worktrees.push(current as WorktreeInfo)
            current = {}
          }
        }
      }
      if (current.path) {
        current.isMain = !current.path.includes(WORKTREE_DIR)
        worktrees.push(current as WorktreeInfo)
      }

      return worktrees
    } catch {
      return []
    }
  }

  /**
   * worktreeを削除
   */
  remove(repoPath: string, worktreePath: string): void {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  }

  /**
   * 不要なworktreeをクリーンアップ
   */
  prune(repoPath: string): void {
    execSync('git worktree prune', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  }

  /**
   * パスがgitリポジトリかどうか確認
   */
  isGitRepo(dirPath: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: dirPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      return true
    } catch {
      return false
    }
  }
}

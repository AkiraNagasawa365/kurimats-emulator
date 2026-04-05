import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs'
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
    mkdirSync(worktreeBase, { recursive: true })

    // gitignoreに追加（まだなければ）
    const gitignorePath = path.join(repoPath, '.gitignore')
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8')
      if (!content.includes(WORKTREE_DIR)) {
        appendFileSync(gitignorePath, `\n${WORKTREE_DIR}/\n`)
      }
    }

    const branchName = `kurimats/${name}`
    try {
      execFileSync('git', ['worktree', 'add', worktreePath, '-b', branchName, baseBranch], {
        cwd: repoPath, encoding: 'utf-8', stdio: 'pipe',
      })
    } catch {
      // ブランチが既に存在する場合、ブランチなしで追加
      execFileSync('git', ['worktree', 'add', worktreePath, branchName], {
        cwd: repoPath, encoding: 'utf-8', stdio: 'pipe',
      })
    }

    return worktreePath
  }

  /**
   * worktreeの現在のブランチ名を取得
   */
  getBranch(worktreePath: string): string | null {
    try {
      return execFileSync('git', ['branch', '--show-current'], {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim() || null
    } catch {
      return null
    }
  }

  /**
   * worktree一覧を取得
   */
  list(repoPath: string): WorktreeInfo[] {
    try {
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
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
    execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  }

  /**
   * 不要なworktreeをクリーンアップ
   */
  prune(repoPath: string): void {
    execFileSync('git', ['worktree', 'prune'], {
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
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
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

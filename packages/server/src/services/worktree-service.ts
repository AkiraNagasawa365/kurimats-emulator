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
   * worktreeを削除し、対応するkurimats/ブランチも削除する
   */
  remove(repoPath: string, worktreePath: string): void {
    // worktree削除前にブランチ名を取得
    const branchName = this.getBranch(worktreePath)

    execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    // kurimats/プレフィックスのブランチのみ自動削除（安全策）
    if (branchName?.startsWith('kurimats/')) {
      try {
        execFileSync('git', ['branch', '-D', branchName], {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: 'pipe',
        })
        console.log(`🌿 ブランチ削除: ${branchName}`)
      } catch {
        // ブランチが既に存在しない場合は無視
      }
    }
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
   * リポジトリ内の孤立したkurimats/ブランチを削除
   * 現在のworktreeに紐づかないkurimats/*ブランチを一括削除する
   */
  cleanupOrphanedBranches(repoPath: string): string[] {
    // 現在のworktreeが使用中のブランチを取得
    const activeWorktrees = this.list(repoPath)
    const activeBranches = new Set(activeWorktrees.map(w => w.branch).filter(Boolean))

    // kurimats/プレフィックスの全ブランチを取得
    let allBranches: string[]
    try {
      const output = execFileSync('git', ['branch', '--list', 'kurimats/*'], {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      allBranches = output.split('\n').map(b => b.trim().replace(/^\* /, '')).filter(Boolean)
    } catch {
      return []
    }

    // 使用中でないブランチを削除（persistent develop ブランチは除外）
    const deleted: string[] = []
    for (const branch of allBranches) {
      if (!activeBranches.has(branch) && !WorktreeService.isPersistentDevelopBranch(branch)) {
        try {
          execFileSync('git', ['branch', '-D', branch], {
            cwd: repoPath,
            encoding: 'utf-8',
            stdio: 'pipe',
          })
          deleted.push(branch)
        } catch {
          // 削除失敗は無視
        }
      }
    }
    return deleted
  }

  /**
   * persistent develop worktree を確保する（冪等）
   * 存在すればそのまま返し、なければ作成する。
   * 命名規則: .kurimats-worktrees/persistent-develop-paneN/
   * ブランチ: kurimats/persistent-develop-paneN
   */
  ensurePersistentDevelopWorktree(repoPath: string, slotNumber: number, baseBranch = 'develop'): string {
    const name = `persistent-develop-pane${slotNumber}`
    const worktreeBase = path.join(repoPath, WORKTREE_DIR)
    const worktreePath = path.join(worktreeBase, name)

    if (existsSync(worktreePath)) {
      return worktreePath
    }

    // worktree ディレクトリがなければ作成
    mkdirSync(worktreeBase, { recursive: true })

    const branchName = `kurimats/${name}`
    try {
      execFileSync('git', ['worktree', 'add', worktreePath, '-b', branchName, baseBranch], {
        cwd: repoPath, encoding: 'utf-8', stdio: 'pipe',
      })
    } catch {
      // ブランチが既に存在する場合、ブランチなしで追加
      try {
        execFileSync('git', ['worktree', 'add', worktreePath, branchName], {
          cwd: repoPath, encoding: 'utf-8', stdio: 'pipe',
        })
      } catch (e) {
        throw new Error(`persistent develop worktree の作成に失敗: ${e}`)
      }
    }

    console.log(`🌿 persistent develop worktree 作成: ${worktreePath}`)
    return worktreePath
  }

  /**
   * パスが persistent develop worktree かどうか判定する
   * パスセグメント境界で判定し、部分一致の誤判定を防ぐ
   */
  static isPersistentDevelop(worktreePath: string): boolean {
    const segments = worktreePath.split(path.sep)
    return segments.some(seg => seg.startsWith('persistent-develop-pane'))
  }

  /**
   * ブランチ名が persistent develop のものかどうか判定する
   */
  static isPersistentDevelopBranch(branchName: string): boolean {
    return branchName.startsWith('kurimats/persistent-develop-pane')
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

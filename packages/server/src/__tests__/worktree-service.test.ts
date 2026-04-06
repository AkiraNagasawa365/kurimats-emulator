import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorktreeService } from '../services/worktree-service'

// execFileSyncをモック
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('.kurimats-worktrees/\n'),
    appendFileSync: vi.fn(),
  }
})

import { execFileSync } from 'child_process'
import { existsSync } from 'fs'

const mockExecFileSync = vi.mocked(execFileSync)
const mockExistsSync = vi.mocked(existsSync)

describe('WorktreeService', () => {
  let service: WorktreeService

  beforeEach(() => {
    service = new WorktreeService()
    vi.clearAllMocks()
  })

  describe('remove()', () => {
    it('worktree削除後にkurimats/ブランチも削除する', () => {
      // getBranch のモック（git branch --show-current）
      mockExecFileSync
        .mockReturnValueOnce('kurimats/test-pane\n') // getBranch
        .mockReturnValueOnce('') // git worktree remove
        .mockReturnValueOnce('') // git branch -D

      service.remove('/repo', '/repo/.kurimats-worktrees/test-pane')

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git', ['worktree', 'remove', '/repo/.kurimats-worktrees/test-pane', '--force'],
        expect.objectContaining({ cwd: '/repo' }),
      )
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git', ['branch', '-D', 'kurimats/test-pane'],
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    it('kurimats/プレフィックスでないブランチは削除しない', () => {
      mockExecFileSync
        .mockReturnValueOnce('main\n') // getBranch → mainブランチ
        .mockReturnValueOnce('') // git worktree remove

      service.remove('/repo', '/repo/.kurimats-worktrees/test-pane')

      // git branch -D は呼ばれない（worktree removeの1回+getBranchの1回のみ）
      expect(mockExecFileSync).toHaveBeenCalledTimes(2)
    })

    it('ブランチ削除失敗は無視する', () => {
      mockExecFileSync
        .mockReturnValueOnce('kurimats/test-pane\n') // getBranch
        .mockReturnValueOnce('') // git worktree remove
        .mockImplementationOnce(() => { throw new Error('branch not found') }) // git branch -D 失敗

      // エラーが投げられないことを確認
      expect(() => service.remove('/repo', '/repo/.kurimats-worktrees/test-pane')).not.toThrow()
    })
  })

  describe('cleanupOrphanedBranches()', () => {
    it('worktreeに紐づかないkurimats/ブランチを削除する', () => {
      // list() のモック（git worktree list --porcelain）
      mockExecFileSync
        .mockReturnValueOnce(
          'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\n' +
          'worktree /repo/.kurimats-worktrees/active-pane\nHEAD def456\nbranch refs/heads/kurimats/active-pane\n\n',
        ) // list
        .mockReturnValueOnce('  kurimats/active-pane\n  kurimats/orphan1\n  kurimats/orphan2\n') // git branch --list
        .mockReturnValueOnce('') // git branch -D orphan1
        .mockReturnValueOnce('') // git branch -D orphan2

      const deleted = service.cleanupOrphanedBranches('/repo')

      expect(deleted).toEqual(['kurimats/orphan1', 'kurimats/orphan2'])
      expect(mockExecFileSync).not.toHaveBeenCalledWith(
        'git', ['branch', '-D', 'kurimats/active-pane'],
        expect.anything(),
      )
    })

    it('孤立ブランチがなければ空配列を返す', () => {
      mockExecFileSync
        .mockReturnValueOnce('worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n')
        .mockReturnValueOnce('') // git branch --list → 空

      const deleted = service.cleanupOrphanedBranches('/repo')
      expect(deleted).toEqual([])
    })
  })
})

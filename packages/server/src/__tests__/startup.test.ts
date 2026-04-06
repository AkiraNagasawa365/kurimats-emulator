import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionStore } from '../services/session-store'
import { runStartupTasks } from '../startup'
import type { WorktreeService } from '../services/worktree-service'

/** WorktreeServiceのモック */
function createMockWorktreeService(): WorktreeService {
  return {
    create: vi.fn().mockReturnValue('/tmp/worktree'),
    remove: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    prune: vi.fn(),
    getBranch: vi.fn().mockReturnValue(null),
    isGitRepo: vi.fn().mockReturnValue(true),
    cleanupOrphanedBranches: vi.fn().mockReturnValue([]),
  } as unknown as WorktreeService
}

describe('runStartupTasks', () => {
  let store: SessionStore
  let worktreeService: ReturnType<typeof createMockWorktreeService>

  beforeEach(() => {
    store = new SessionStore(':memory:')
    worktreeService = createMockWorktreeService()
  })

  afterEach(() => {
    store.close()
  })

  it('activeセッションをdisconnectedに変更する', () => {
    const session = store.create({
      name: 'test-session',
      repoPath: '/tmp/repo',
      isRemote: false,
      workspaceId: null,
      projectId: null,
    })
    // activeのまま

    runStartupTasks(store, worktreeService as unknown as WorktreeService)

    const updated = store.getById(session.id)
    expect(updated?.status).toBe('disconnected')
  })

  it('disconnectedセッションのworktreePathをnullに更新する', () => {
    const session = store.create({
      name: 'test-session',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/test-session',
      baseBranch: 'kurimats/test-session',
      isRemote: false,
      workspaceId: null,
      projectId: null,
    })
    // disconnectedに設定
    store.updateStatus(session.id, 'disconnected')

    runStartupTasks(store, worktreeService as unknown as WorktreeService)

    const updated = store.getById(session.id)
    expect(updated?.worktreePath).toBeNull()
    expect(worktreeService.remove).toHaveBeenCalledWith(
      '/tmp/repo',
      '/tmp/repo/.kurimats-worktrees/test-session',
    )
  })

  it('ペインツリーに含まれない孤立セッションを削除する', () => {
    // ワークスペースに紐付いているがペインツリーに含まれないセッション
    const ws = store.createCmuxWorkspace(
      { name: 'test-ws', repoPath: '/tmp/repo' },
      { kind: 'leaf', id: 'pane-a', surfaces: [], activeSurfaceIndex: 0, ratio: 1 },
    )
    const orphan = store.create({
      name: 'orphan-session',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/orphan',
      isRemote: false,
      workspaceId: ws.id,
      projectId: null,
    })

    runStartupTasks(store, worktreeService as unknown as WorktreeService)

    const found = store.getById(orphan.id)
    expect(found).toBeNull()
    expect(worktreeService.remove).toHaveBeenCalledWith(
      '/tmp/repo',
      '/tmp/repo/.kurimats-worktrees/orphan',
    )
  })

  it('worktreeService.remove失敗時もセッション削除は続行する', () => {
    const ws = store.createCmuxWorkspace(
      { name: 'test-ws', repoPath: '/tmp/repo' },
      { kind: 'leaf', id: 'pane-a', surfaces: [], activeSurfaceIndex: 0, ratio: 1 },
    )
    const orphan = store.create({
      name: 'orphan-session',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/orphan',
      isRemote: false,
      workspaceId: ws.id,
      projectId: null,
    })

    vi.mocked(worktreeService.remove).mockImplementation(() => {
      throw new Error('worktree not found')
    })

    // エラーが投げられないことを確認
    expect(() => runStartupTasks(store, worktreeService as unknown as WorktreeService)).not.toThrow()

    // セッションは削除されている
    expect(store.getById(orphan.id)).toBeNull()
  })
})

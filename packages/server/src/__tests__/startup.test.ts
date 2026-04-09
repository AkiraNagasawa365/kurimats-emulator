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

  describe('ローカルセッション', () => {
    it('activeセッションをdisconnectedに変更する', () => {
      const session = store.create({
        name: 'test-session',
        repoPath: '/tmp/repo',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      runStartupTasks(store, worktreeService as unknown as WorktreeService)

      const updated = store.getById(session.id)
      expect(updated?.status).toBe('disconnected')
    })
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
      { kind: 'leaf', id: 'pane-a', sessionId: 'test-session', ratio: 1 },
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

  describe('SSHセッション', () => {
    it('activeなSSHセッションをdisconnectedに変更する', () => {
      const session = store.create({
        name: 'remote-session',
        repoPath: '/data1/remote-repo',
        sshHost: 'elith-remote',
        isRemote: true,
        workspaceId: null,
        projectId: null,
      })

      runStartupTasks(store, worktreeService as unknown as WorktreeService)

      const updated = store.getById(session.id)
      expect(updated?.status).toBe('disconnected')
      // SSHセッションはworktreeを持たないのでremoveは呼ばれない
      expect(worktreeService.remove).not.toHaveBeenCalled()
    })

    it('disconnectedなSSHセッションはworktree操作なしで保持される', () => {
      const session = store.create({
        name: 'remote-session',
        repoPath: '/data1/remote-repo',
        sshHost: 'elith-remote',
        isRemote: true,
        workspaceId: null,
        projectId: null,
      })
      store.updateStatus(session.id, 'disconnected')

      runStartupTasks(store, worktreeService as unknown as WorktreeService)

      const updated = store.getById(session.id)
      // セッション自体は残る
      expect(updated).not.toBeNull()
      expect(updated?.status).toBe('disconnected')
      expect(updated?.worktreePath).toBeNull()
      // worktreePathがnullなのでremoveは呼ばれない
      expect(worktreeService.remove).not.toHaveBeenCalled()
    })

    it('ペインツリーに含まれない孤立SSHセッションを削除する', () => {
      const ws = store.createCmuxWorkspace(
        { name: 'ssh-ws', repoPath: '/data1/remote-repo', sshHost: 'elith-remote' },
        { kind: 'leaf', id: 'pane-a', sessionId: 'test-session', ratio: 1 },
      )
      const orphan = store.create({
        name: 'orphan-ssh',
        repoPath: '/data1/remote-repo',
        sshHost: 'elith-remote',
        isRemote: true,
        workspaceId: ws.id,
        projectId: null,
      })

      runStartupTasks(store, worktreeService as unknown as WorktreeService)

      expect(store.getById(orphan.id)).toBeNull()
      // SSHはworktreeを持たないのでremoveは呼ばれない
      expect(worktreeService.remove).not.toHaveBeenCalled()
    })
  })

  describe('ローカル+SSH混在', () => {
    it('ローカルとSSHが混在するワークスペースで正しくcleanupされる', () => {
      const ws = store.createCmuxWorkspace(
        { name: 'mixed-ws', repoPath: '/tmp/repo' },
        { kind: 'leaf', id: 'pane-a', sessionId: 'test-session', ratio: 1 },
      )

      // ローカルセッション（worktreeあり）— 孤立
      const localOrphan = store.create({
        name: 'local-orphan',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/local-orphan',
        isRemote: false,
        workspaceId: ws.id,
        projectId: null,
      })

      // SSHセッション（worktreeなし）— 孤立
      const sshOrphan = store.create({
        name: 'ssh-orphan',
        repoPath: '/data1/remote-repo',
        sshHost: 'elith-remote',
        isRemote: true,
        workspaceId: ws.id,
        projectId: null,
      })

      runStartupTasks(store, worktreeService as unknown as WorktreeService)

      // 両方とも削除される
      expect(store.getById(localOrphan.id)).toBeNull()
      expect(store.getById(sshOrphan.id)).toBeNull()

      // ローカルのworktreeのみremoveが呼ばれる
      expect(worktreeService.remove).toHaveBeenCalledTimes(1)
      expect(worktreeService.remove).toHaveBeenCalledWith(
        '/tmp/repo',
        '/tmp/repo/.kurimats-worktrees/local-orphan',
      )
    })

    it('disconnected時にローカルのworktreeのみ解放しSSHは影響しない', () => {
      // ローカルセッション（worktreeあり）
      const localSession = store.create({
        name: 'local-session',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/local-session',
        baseBranch: 'kurimats/local-session',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })
      store.updateStatus(localSession.id, 'disconnected')

      // SSHセッション
      const sshSession = store.create({
        name: 'ssh-session',
        repoPath: '/data1/remote-repo',
        sshHost: 'elith-remote',
        isRemote: true,
        workspaceId: null,
        projectId: null,
      })
      store.updateStatus(sshSession.id, 'disconnected')

      runStartupTasks(store, worktreeService as unknown as WorktreeService)

      // ローカル: worktreePathがnullに更新
      const localUpdated = store.getById(localSession.id)
      expect(localUpdated?.worktreePath).toBeNull()
      expect(worktreeService.remove).toHaveBeenCalledWith(
        '/tmp/repo',
        '/tmp/repo/.kurimats-worktrees/local-session',
      )

      // SSH: 変化なし（元からworktreePathがnull）
      const sshUpdated = store.getById(sshSession.id)
      expect(sshUpdated).not.toBeNull()
      expect(sshUpdated?.status).toBe('disconnected')

      // removeは1回のみ（ローカル分）
      expect(worktreeService.remove).toHaveBeenCalledTimes(1)
    })
  })

  it('worktreeService.remove失敗時もセッション削除は続行する', () => {
    const ws = store.createCmuxWorkspace(
      { name: 'test-ws', repoPath: '/tmp/repo' },
      { kind: 'leaf', id: 'pane-a', sessionId: 'test-session', ratio: 1 },
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

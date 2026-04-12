import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionStore } from '../services/session-store'
import { cleanupSession, retryTombstoneCleanup } from '../services/session-lifecycle'

/** PtyManager のモック */
function createMockPtyManager() {
  return {
    kill: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    spawn: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
    getBuffer: vi.fn().mockReturnValue(''),
    on: vi.fn(),
    removeListener: vi.fn(),
    backend: 'node-pty' as const,
    getActiveSessionIds: vi.fn().mockReturnValue([]),
    killAll: vi.fn(),
  } as any
}

/** SshManager のモック */
function createMockSshManager() {
  return {
    kill: vi.fn(),
    hasSession: vi.fn().mockReturnValue(false),
    connect: vi.fn().mockResolvedValue(undefined),
    spawn: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
    getBuffer: vi.fn().mockReturnValue(''),
    on: vi.fn(),
    removeListener: vi.fn(),
    getActiveSessionIds: vi.fn().mockReturnValue([]),
    disconnectAll: vi.fn(),
    getHosts: vi.fn().mockReturnValue([]),
  } as any
}

/** WorktreeService のモック */
function createMockWorktreeService(removeThrows = false) {
  return {
    remove: removeThrows
      ? vi.fn().mockImplementation(() => { throw new Error('worktree 削除失敗') })
      : vi.fn(),
    create: vi.fn().mockReturnValue('/tmp/worktree'),
    getBranch: vi.fn().mockReturnValue('main'),
    isGitRepo: vi.fn().mockReturnValue(true),
    list: vi.fn().mockReturnValue([]),
    prune: vi.fn(),
    cleanupOrphanedBranches: vi.fn().mockReturnValue([]),
    ensurePersistentDevelopWorktree: vi.fn().mockReturnValue('/tmp/persistent'),
  } as any
}

describe('cleanupSession (async)', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('正常な cleanup: PTY kill → worktree 削除 → DB 削除', async () => {
    const session = store.create({
      name: 'test',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/test',
    })

    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    const worktreeService = createMockWorktreeService()

    await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)

    // PTY が kill されている
    expect(ptyManager.kill).toHaveBeenCalledWith(session.id)
    // worktree が削除されている
    expect(worktreeService.remove).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/.kurimats-worktrees/test')
    // DB から削除されている
    expect(store.getById(session.id)).toBeNull()
  })

  it('worktree 削除失敗 → tombstone に遷移（DB は残る）', async () => {
    const session = store.create({
      name: 'test',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/test',
    })

    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    const worktreeService = createMockWorktreeService(true) // remove が例外を投げる

    await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)

    // DB にはまだ残っていて tombstone 状態
    const remaining = store.getById(session.id)
    expect(remaining).not.toBeNull()
    expect(remaining!.status).toBe('tombstone')
  })

  it('worktree なしのセッションは直接 DB 削除', async () => {
    const session = store.create({
      name: 'test',
      repoPath: '/tmp/repo',
      // worktreePath なし
    })

    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    const worktreeService = createMockWorktreeService()

    await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)

    expect(store.getById(session.id)).toBeNull()
    expect(worktreeService.remove).not.toHaveBeenCalled()
  })

  it('存在しないセッション ID は安全に無視される', async () => {
    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    const worktreeService = createMockWorktreeService()

    await expect(
      cleanupSession(store, ptyManager, sshManager, worktreeService, 'non-existent'),
    ).resolves.not.toThrow()
  })

  it('SSH セッションの場合は sshManager.kill が呼ばれる', async () => {
    const session = store.create({
      name: 'test',
      repoPath: '/tmp/repo',
      sshHost: 'remote-host',
      isRemote: true,
    })

    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    sshManager.hasSession.mockReturnValue(true)
    const worktreeService = createMockWorktreeService()

    await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)

    expect(sshManager.kill).toHaveBeenCalledWith(session.id)
    expect(ptyManager.kill).not.toHaveBeenCalled()
  })

  it('persistent develop worktree はセッション削除時に worktree を残す', async () => {
    const session = store.create({
      name: 'test',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/persistent-develop-pane1',
    })

    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    const worktreeService = createMockWorktreeService()

    await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)

    // worktree は削除されない
    expect(worktreeService.remove).not.toHaveBeenCalled()
    // セッションは DB から削除される
    expect(store.getById(session.id)).toBeNull()
  })

  it('cleanup 中は cleaning 状態を経由する', async () => {
    const session = store.create({
      name: 'test',
      repoPath: '/tmp/repo',
    })

    // worktreeService.remove を遅延させて cleaning 状態を確認
    const ptyManager = createMockPtyManager()
    const sshManager = createMockSshManager()
    const worktreeService = createMockWorktreeService()

    // cleanupSession 開始直後に状態を確認するため、pty.kill のモックで状態をキャプチャ
    let statusDuringKill: string | undefined
    ptyManager.kill.mockImplementation(() => {
      statusDuringKill = store.getById(session.id)?.status
    })

    await cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)

    expect(statusDuringKill).toBe('cleaning')
  })
})

describe('retryTombstoneCleanup', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('tombstone セッションの worktree を削除して DB から消す', () => {
    const session = store.create({
      name: 'tombstone-test',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/tombstone',
    })
    store.updateStatus(session.id, 'tombstone')

    const worktreeService = createMockWorktreeService()
    retryTombstoneCleanup(store, worktreeService)

    expect(worktreeService.remove).toHaveBeenCalled()
    expect(store.getById(session.id)).toBeNull()
  })

  it('tombstone retry でも worktree 削除失敗の場合は残留する', () => {
    const session = store.create({
      name: 'tombstone-test',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/stuck',
    })
    store.updateStatus(session.id, 'tombstone')

    const worktreeService = createMockWorktreeService(true) // remove が例外
    retryTombstoneCleanup(store, worktreeService)

    // DB に残留
    const remaining = store.getById(session.id)
    expect(remaining).not.toBeNull()
    expect(remaining!.status).toBe('tombstone')
  })

  it('tombstone がない場合は何もしない', () => {
    const worktreeService = createMockWorktreeService()
    retryTombstoneCleanup(store, worktreeService)

    expect(worktreeService.remove).not.toHaveBeenCalled()
  })

  it('persistent develop の tombstone は worktree を削除せず DB から消す', () => {
    const session = store.create({
      name: 'persistent-tombstone',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.kurimats-worktrees/persistent-develop-pane1',
    })
    store.updateStatus(session.id, 'tombstone')

    const worktreeService = createMockWorktreeService()
    retryTombstoneCleanup(store, worktreeService)

    // worktree は削除されない
    expect(worktreeService.remove).not.toHaveBeenCalled()
    // DB からは削除される
    expect(store.getById(session.id)).toBeNull()
  })
})

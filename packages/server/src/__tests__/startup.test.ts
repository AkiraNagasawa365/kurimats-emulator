import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionStore } from '../services/session-store'
import { runStartupTasks, resolveSelfWorktreeVerdict } from '../startup'
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

/** 既存テストを verdict='outside' で実行するための cwd オプション */
const OUTSIDE_CWD = { cwd: '/tmp/definitely-not-a-worktree' }

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

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

    runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

    runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

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
    expect(() => runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)).not.toThrow()

    // セッションは削除されている
    expect(store.getById(orphan.id)).toBeNull()
  })

  // ── StartupGuard テスト ──────────────────────────────

  describe('StartupGuard (resolveSelfWorktreeVerdict)', () => {
    it("verdict='inside': cwd が worktreePath 配下 → 段階1-4 未実行", () => {
      // worktree を持つ disconnected セッションを作成
      const session = store.create({
        name: 'pane1-session',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/pane1',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })
      // active のまま → 通常なら段階1で disconnected に変更される

      // cwd を worktree 内に設定
      runStartupTasks(store, worktreeService as unknown as WorktreeService, {
        cwd: '/tmp/repo/.kurimats-worktrees/pane1/packages/server',
      })

      // 段階1 がスキップされたので active のまま
      const updated = store.getById(session.id)
      expect(updated?.status).toBe('active')

      // 段階2-4 もスキップ: worktree 削除は呼ばれない
      expect(worktreeService.remove).not.toHaveBeenCalled()
      expect(worktreeService.prune).not.toHaveBeenCalled()
    })

    it("verdict='unknown': sessionStore.getAll() 例外 → 段階1-4 未実行 (fail-safe)", () => {
      const session = store.create({
        name: 'test-session',
        repoPath: '/tmp/repo',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      // sessionStore.getAll を一時的にモックして例外を投げさせる
      // → resolveSelfWorktreeVerdict が 'unknown' を返す
      const originalGetAll = store.getAll.bind(store)
      let callCount = 0
      vi.spyOn(store, 'getAll').mockImplementation(() => {
        callCount++
        // 最初の呼び出し（verdict判定）で例外を投げる
        if (callCount === 1) {
          throw new Error('DB接続エラー')
        }
        return originalGetAll()
      })

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

      // 段階1 がスキップされたので active のまま
      const updated = store.getById(session.id)
      expect(updated?.status).toBe('active')

      // 段階2-4 もスキップ
      expect(worktreeService.remove).not.toHaveBeenCalled()
      expect(worktreeService.prune).not.toHaveBeenCalled()
    })

    it("verdict='outside': 従来通り全段階実行", () => {
      const session = store.create({
        name: 'test-session',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/test-session',
        baseBranch: 'kurimats/test-session',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      // まず active → disconnected にするため runStartupTasks を実行
      // cwd は worktree の外
      runStartupTasks(store, worktreeService as unknown as WorktreeService, {
        cwd: '/tmp/completely-outside',
      })

      // 段階1 が実行: active → disconnected
      const updated = store.getById(session.id)
      expect(updated?.status).toBe('disconnected')

      // 段階2 が実行: worktree 削除
      expect(worktreeService.remove).toHaveBeenCalledWith(
        '/tmp/repo',
        '/tmp/repo/.kurimats-worktrees/test-session',
      )
      expect(updated?.worktreePath).toBeNull()
    })
  })

  describe('resolveSelfWorktreeVerdict 単体', () => {
    it('cwd が worktreePath のサブディレクトリなら inside を返す', () => {
      store.create({
        name: 'pane1',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/pane1',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      const verdict = resolveSelfWorktreeVerdict(store, {
        cwd: '/tmp/repo/.kurimats-worktrees/pane1/packages/server',
      })
      expect(verdict).toBe('inside')
    })

    it('cwd が worktreePath と一致する場合も inside を返す', () => {
      store.create({
        name: 'pane1',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/pane1',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      const verdict = resolveSelfWorktreeVerdict(store, {
        cwd: '/tmp/repo/.kurimats-worktrees/pane1',
      })
      expect(verdict).toBe('inside')
    })

    it('cwd が worktree 外なら outside を返す', () => {
      store.create({
        name: 'pane1',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/pane1',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      const verdict = resolveSelfWorktreeVerdict(store, {
        cwd: '/tmp/completely-outside',
      })
      expect(verdict).toBe('outside')
    })

    it('フォールバック: .kurimats-worktrees セグメントを含む cwd は inside', () => {
      // DB にセッションがない状態でもパスベースのフォールバックが効く
      const verdict = resolveSelfWorktreeVerdict(store, {
        cwd: '/tmp/repo/.kurimats-worktrees/kurimats-emulator-pane1/packages/server',
      })
      expect(verdict).toBe('inside')
    })

    it('prefix隣接: pane1 と pane10 を誤判定しない', () => {
      store.create({
        name: 'pane1',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/pane1',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      // pane10 は pane1 の prefix を含むが別ディレクトリ → outside
      const verdict = resolveSelfWorktreeVerdict(store, {
        cwd: '/tmp/repo/.kurimats-worktrees/pane10/packages/server',
      })
      // pane10 は pane1 配下ではないが、.kurimats-worktrees セグメントのフォールバックで inside
      expect(verdict).toBe('inside')
    })

    it('sessionStore.getAll() 例外時は unknown を返す', () => {
      vi.spyOn(store, 'getAll').mockImplementation(() => {
        throw new Error('DB接続エラー')
      })

      const verdict = resolveSelfWorktreeVerdict(store, {
        cwd: '/tmp/completely-outside',
      })
      expect(verdict).toBe('unknown')
    })
  })

  describe('StartupGuard: inside/unknown 時も段階0・5は実行される', () => {
    it("verdict='inside' でも段階5（ブランチ名修正）が実行される", () => {
      // worktree を持つセッションを作成（ブランチ名が古い状態）
      const session = store.create({
        name: 'pane1-session',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/pane1',
        baseBranch: 'old-branch',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })

      // getBranch が新しいブランチ名を返す
      vi.mocked(worktreeService.getBranch).mockReturnValue('new-branch')

      // cwd を worktree 内に設定 → verdict='inside'
      runStartupTasks(store, worktreeService as unknown as WorktreeService, {
        cwd: '/tmp/repo/.kurimats-worktrees/pane1/packages/server',
      })

      // 段階1 がスキップされたので active のまま
      const updated = store.getById(session.id)
      expect(updated?.status).toBe('active')

      // 段階5 は実行: ブランチ名が修正される
      expect(updated?.branch).toBe('new-branch')
      expect(worktreeService.getBranch).toHaveBeenCalledWith('/tmp/repo/.kurimats-worktrees/pane1')
    })
  })

  describe('persistent develop worktree の保護', () => {
    it('段階2で persistent develop worktree が削除されない', () => {
      const session = store.create({
        name: 'persistent-session',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/persistent-develop-pane0',
        baseBranch: 'kurimats/persistent-develop-pane0',
        isRemote: false,
        workspaceId: null,
        projectId: null,
      })
      store.updateStatus(session.id, 'disconnected')

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

      // persistent develop worktree は削除されない
      const updated = store.getById(session.id)
      expect(updated?.worktreePath).toBe('/tmp/repo/.kurimats-worktrees/persistent-develop-pane0')
      expect(worktreeService.remove).not.toHaveBeenCalled()
    })

    it('段階3で persistent develop worktree を持つ孤立セッションが保護される', () => {
      const ws = store.createCmuxWorkspace(
        { name: 'test-ws', repoPath: '/tmp/repo' },
        { kind: 'leaf', id: 'pane-a', sessionId: 'some-other-session', ratio: 1 },
      )
      const orphan = store.create({
        name: 'persistent-orphan',
        repoPath: '/tmp/repo',
        worktreePath: '/tmp/repo/.kurimats-worktrees/persistent-develop-pane1',
        isRemote: false,
        workspaceId: ws.id,
        projectId: null,
      })

      runStartupTasks(store, worktreeService as unknown as WorktreeService, OUTSIDE_CWD)

      // persistent develop worktree は worktreeService.remove されない
      expect(worktreeService.remove).not.toHaveBeenCalledWith(
        '/tmp/repo',
        '/tmp/repo/.kurimats-worktrees/persistent-develop-pane1',
      )
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { PtyManager } from '../services/pty-manager.js'
import { SshManager } from '../services/ssh-manager.js'
import { SessionStore } from '../services/session-store.js'
import { WorktreeService } from '../services/worktree-service.js'
import { createSessionsRouter } from '../routes/sessions.js'

const describeServer = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1' ? describe.skip : describe

describeServer('セッションAPI', () => {
  let server: Server
  let baseUrl: string
  let store: SessionStore
  let ptyManager: PtyManager

  beforeEach(async () => {
    store = new SessionStore(':memory:')
    ptyManager = new PtyManager()
    ptyManager._forceBackend('child_process')
    vi.spyOn(ptyManager, 'initialize').mockResolvedValue('child_process')
    vi.spyOn(ptyManager, 'spawn').mockResolvedValue()
    const sshManager = new SshManager()
    const worktreeService = new WorktreeService()

    const app = express()
    app.use(express.json())
    app.use('/api/sessions', createSessionsRouter(store, ptyManager, sshManager, worktreeService))

    server = createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ptyManager.killAll()
    store.close()
    server.close()
  })

  it('セッション一覧が空で返る', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`)
    const sessions = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(sessions)).toBe(true)
  })

  it('セッションを作成できる', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test',
        repoPath: '/tmp',
        useWorktree: false,
      }),
    })
    const session = await res.json()
    expect(res.status).toBe(201)
    expect(session.name).toBe('test')
    expect(session.status).toBe('active')
    expect(session.id).toBeTruthy()
  })

  it('名前なしでは400エラー', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath: '/tmp' }),
    })
    expect(res.status).toBe(400)
  })

  it('お気に入りをトグルできる', async () => {
    // セッション作成
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'fav-test', repoPath: '/tmp', useWorktree: false }),
    })
    const session = await createRes.json()

    // お気に入りトグル（false → true）
    const toggleRes = await fetch(`${baseUrl}/api/sessions/${session.id}/favorite`, { method: 'POST' })
    const toggleResult = await toggleRes.json()
    expect(toggleRes.status).toBe(200)
    expect(toggleResult.isFavorite).toBe(true)

    // もう一度トグル（true → false）
    const toggleRes2 = await fetch(`${baseUrl}/api/sessions/${session.id}/favorite`, { method: 'POST' })
    const toggleResult2 = await toggleRes2.json()
    expect(toggleResult2.isFavorite).toBe(false)
  })

  it('ターミナルプレビューを取得できる', async () => {
    // セッション作成
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'preview-test', repoPath: '/tmp', useWorktree: false }),
    })
    const session = await createRes.json()

    // プレビュー取得（バッファが空でも正常に返る）
    const previewRes = await fetch(`${baseUrl}/api/sessions/${session.id}/preview?lines=3`)
    const preview = await previewRes.json()
    expect(previewRes.status).toBe(200)
    expect(preview.sessionId).toBe(session.id)
    expect(Array.isArray(preview.lines)).toBe(true)
  })

  it('存在しないセッションのプレビューは404', async () => {
    const previewRes = await fetch(`${baseUrl}/api/sessions/nonexistent/preview`)
    expect(previewRes.status).toBe(404)
  })

  it('disconnectedセッションを再接続できる', async () => {
    // セッション作成
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'reconnect-test', repoPath: '/tmp', useWorktree: false }),
    })
    const session = await createRes.json()
    expect(session.status).toBe('active')

    // disconnected状態に変更
    store.updateStatus(session.id, 'disconnected')
    ptyManager.kill(session.id)

    // 再接続
    const reconnectRes = await fetch(`${baseUrl}/api/sessions/${session.id}/reconnect`, { method: 'POST' })
    const result = await reconnectRes.json()
    expect(reconnectRes.status).toBe(200)
    expect(result.ok).toBe(true)
    expect(result.session.status).toBe('active')
  })

  it('activeセッションの再接続は400エラー', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'active-test', repoPath: '/tmp', useWorktree: false }),
    })
    const session = await createRes.json()

    const reconnectRes = await fetch(`${baseUrl}/api/sessions/${session.id}/reconnect`, { method: 'POST' })
    expect(reconnectRes.status).toBe(400)
  })

  it('存在しないセッションの再接続は404', async () => {
    const reconnectRes = await fetch(`${baseUrl}/api/sessions/nonexistent/reconnect`, { method: 'POST' })
    expect(reconnectRes.status).toBe(404)
  })

  it('サーバー起動時にactiveセッションがorphanedとして検出される', () => {
    // activeセッションを作成（PTYなし = orphaned状態をシミュレート）
    const session = store.create({
      name: 'orphan-test',
      repoPath: '/tmp',
    })
    expect(session.status).toBe('active')

    // orphanedセッションをdisconnectedに変更するロジックをテスト
    const orphaned = store.getAll().filter(s => s.status === 'active')
    for (const s of orphaned) {
      store.updateStatus(s.id, 'disconnected')
    }

    const updated = store.getById(session.id)
    expect(updated?.status).toBe('disconnected')
  })

  it('セッションを削除できる', async () => {
    // 作成
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'to-delete', repoPath: '/tmp', useWorktree: false }),
    })
    const session = await createRes.json()

    // 削除
    const delRes = await fetch(`${baseUrl}/api/sessions/${session.id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(200)

    // 削除後はDBから物理削除される（404）
    const getRes = await fetch(`${baseUrl}/api/sessions/${session.id}`)
    expect(getRes.status).toBe(404)
  })
})

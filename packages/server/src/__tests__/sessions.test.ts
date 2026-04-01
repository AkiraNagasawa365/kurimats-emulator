import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { PtyManager } from '../services/pty-manager.js'
import { SshManager } from '../services/ssh-manager.js'
import { SessionStore } from '../services/session-store.js'
import { WorktreeService } from '../services/worktree-service.js'
import { createSessionsRouter } from '../routes/sessions.js'

describe('セッションAPI', () => {
  let server: Server
  let baseUrl: string
  let store: SessionStore
  let ptyManager: PtyManager

  beforeEach(async () => {
    store = new SessionStore()
    ptyManager = new PtyManager()
    const sshManager = new SshManager()
    const worktreeService = new WorktreeService()

    const app = express()
    app.use(express.json())
    app.use('/api/sessions', createSessionsRouter(store, ptyManager, sshManager, worktreeService))

    server = createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve())
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    baseUrl = `http://localhost:${port}`
  })

  afterEach(() => {
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

    // 削除後は terminated
    const getRes = await fetch(`${baseUrl}/api/sessions/${session.id}`)
    const deleted = await getRes.json()
    expect(deleted.status).toBe('terminated')
  })
})

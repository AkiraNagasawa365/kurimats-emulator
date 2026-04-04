import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { SessionStore } from '../services/session-store.js'
import { PtyManager } from '../services/pty-manager.js'
import { SshManager } from '../services/ssh-manager.js'
import { WorktreeService } from '../services/worktree-service.js'
import { createSessionsRouter } from '../routes/sessions.js'
import { createProjectsRouter } from '../routes/projects.js'
import { createLayoutRouter } from '../routes/layout.js'

const describeServer = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1' ? describe.skip : describe

describeServer('プロジェクト・お気に入り・レイアウトAPI', () => {
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
    app.use('/api/projects', createProjectsRouter(store))
    app.use('/api/layout', createLayoutRouter(store))

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

  // プロジェクトCRUD
  describe('プロジェクト', () => {
    it('プロジェクトを作成・一覧取得できる', async () => {
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'テストPJ', color: '#3b82f6', repoPath: '/tmp' }),
      })
      expect(createRes.status).toBe(201)
      const project = await createRes.json()
      expect(project.name).toBe('テストPJ')
      expect(project.color).toBe('#3b82f6')

      const listRes = await fetch(`${baseUrl}/api/projects`)
      const projects = await listRes.json()
      const found = projects.find((p: { id: string }) => p.id === project.id)
      expect(found).toBeTruthy()
      expect(found.name).toBe('テストPJ')
    })

    it('プロジェクトを更新できる', async () => {
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '更新前', color: '#ef4444', repoPath: '/tmp' }),
      })
      const project = await createRes.json()

      const updateRes = await fetch(`${baseUrl}/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '更新後', color: '#10b981' }),
      })
      expect(updateRes.status).toBe(200)

      const listRes = await fetch(`${baseUrl}/api/projects`)
      const projects = await listRes.json()
      expect(projects[0].name).toBe('更新後')
      expect(projects[0].color).toBe('#10b981')
    })

    it('プロジェクトを削除できる', async () => {
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '削除用', color: '#3b82f6', repoPath: '/tmp' }),
      })
      const project = await createRes.json()

      const delRes = await fetch(`${baseUrl}/api/projects/${project.id}`, { method: 'DELETE' })
      expect(delRes.status).toBe(200)

      // 削除後に再取得して確認
      const getRes = await fetch(`${baseUrl}/api/projects`)
      const remaining = await getRes.json()
      const found = remaining.find((p: { id: string }) => p.id === project.id)
      expect(found).toBeUndefined()
    })
  })

  // お気に入り
  describe('お気に入り', () => {
    it('お気に入りをトグルできる', async () => {
      // セッション作成
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'fav-test', repoPath: '/tmp', useWorktree: false }),
      })
      const session = await createRes.json()
      expect(session.isFavorite).toBe(false)

      // お気に入りON
      const favRes1 = await fetch(`${baseUrl}/api/sessions/${session.id}/favorite`, { method: 'POST' })
      const fav1 = await favRes1.json()
      expect(fav1.isFavorite).toBe(true)

      // お気に入りOFF
      const favRes2 = await fetch(`${baseUrl}/api/sessions/${session.id}/favorite`, { method: 'POST' })
      const fav2 = await favRes2.json()
      expect(fav2.isFavorite).toBe(false)
    })

    it('プロジェクトをセッションに割り当てできる', async () => {
      // プロジェクト作成
      const projRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PJ1', color: '#3b82f6', repoPath: '/tmp' }),
      })
      const project = await projRes.json()

      // セッション作成
      const sessRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'proj-test', repoPath: '/tmp', useWorktree: false }),
      })
      const session = await sessRes.json()

      // プロジェクト割り当て
      const assignRes = await fetch(`${baseUrl}/api/sessions/${session.id}/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      })
      expect(assignRes.status).toBe(200)

      // セッション取得して確認
      const getRes = await fetch(`${baseUrl}/api/sessions/${session.id}`)
      const updated = await getRes.json()
      expect(updated.projectId).toBe(project.id)
    })
  })

  // レイアウト永続化
  describe('レイアウト', () => {
    it('レイアウトを保存・取得できる', async () => {
      const layout = {
        mode: '2x2',
        panels: [
          { sessionId: null, position: 0 },
          { sessionId: null, position: 1 },
          { sessionId: null, position: 2 },
          { sessionId: null, position: 3 },
        ],
        activePanelIndex: 1,
        savedAt: Date.now(),
      }

      const saveRes = await fetch(`${baseUrl}/api/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      })
      expect(saveRes.status).toBe(200)

      const getRes = await fetch(`${baseUrl}/api/layout`)
      const saved = await getRes.json()
      expect(saved.mode).toBe('2x2')
      expect(saved.panels).toHaveLength(4)
      expect(saved.activePanelIndex).toBe(1)
    })

    it('レイアウトを上書き保存できる', async () => {
      const layout1 = {
        mode: '1x1',
        panels: [{ sessionId: null, position: 0 }],
        activePanelIndex: 0,
        savedAt: Date.now(),
      }

      await fetch(`${baseUrl}/api/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout1),
      })

      const getRes = await fetch(`${baseUrl}/api/layout`)
      const saved = await getRes.json()
      expect(saved.mode).toBe('1x1')
      expect(saved.panels).toHaveLength(1)
    })
  })
})

// SSHセッション修正に伴うテスト更新 (#41)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { SessionStore } from '../services/session-store.js'
import { PtyManager } from '../services/pty-manager.js'
import { SshManager } from '../services/ssh-manager.js'
import { createTabRouter } from '../routes/tab.js'
import { createLayoutRouter } from '../routes/layout.js'

describe('tabコマンドAPI', () => {
  let server: Server
  let baseUrl: string
  let store: SessionStore
  let ptyManager: PtyManager
  let sshManager: SshManager

  beforeEach(async () => {
    store = new SessionStore()
    ptyManager = new PtyManager()
    sshManager = new SshManager()

    const app = express()
    app.use(express.json())
    app.use('/api/tab', createTabRouter(store, ptyManager, sshManager))
    app.use('/api/layout', createLayoutRouter(store))

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

  it('GET /api/tab/list がホスト一覧を返す', async () => {
    const res = await fetch(`${baseUrl}/api/tab/list`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('hosts')
    expect(Array.isArray(data.hosts)).toBe(true)
  })

  it('POST /api/tab/sync が同期結果を返す', async () => {
    const res = await fetch(`${baseUrl}/api/tab/sync`, { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('created')
    expect(data).toHaveProperty('skipped')
    expect(data).toHaveProperty('projects')
    expect(data).toHaveProperty('sessions')
    expect(typeof data.created).toBe('number')
    expect(typeof data.skipped).toBe('number')
    expect(Array.isArray(data.sessions)).toBe(true)
  })
})

describe('ボードレイアウトAPI', () => {
  let server: Server
  let baseUrl: string
  let store: SessionStore

  beforeEach(async () => {
    store = new SessionStore()

    const app = express()
    app.use(express.json())
    app.use('/api/layout', createLayoutRouter(store))

    server = createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve())
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    baseUrl = `http://localhost:${port}`
  })

  afterEach(() => {
    store.close()
    server.close()
  })

  it('PUT /api/layout/board でボードレイアウトを保存できる', async () => {
    const boardState = {
      nodes: [
        { sessionId: 'session-1', x: 50, y: 50, width: 600, height: 400 },
        { sessionId: 'session-2', x: 700, y: 50, width: 600, height: 400 },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
    }

    const putRes = await fetch(`${baseUrl}/api/layout/board`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boardState),
    })
    expect(putRes.status).toBe(200)
    const putData = await putRes.json()
    expect(putData.ok).toBe(true)

    // 保存したデータを取得
    const getRes = await fetch(`${baseUrl}/api/layout/board`)
    expect(getRes.status).toBe(200)
    const getData = await getRes.json()
    expect(getData.nodes).toHaveLength(2)
    expect(getData.nodes[0].sessionId).toBe('session-1')
    expect(getData.nodes[1].sessionId).toBe('session-2')
    expect(getData.viewport.zoom).toBe(1)
  })

  it('ボードレイアウトを上書き保存できる', async () => {
    // 最初の保存
    await fetch(`${baseUrl}/api/layout/board`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [{ sessionId: 'a', x: 0, y: 0, width: 600, height: 400 }],
        viewport: { x: 0, y: 0, zoom: 1 },
        savedAt: Date.now(),
      }),
    })

    // 上書き保存
    await fetch(`${baseUrl}/api/layout/board`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [
          { sessionId: 'b', x: 100, y: 100, width: 800, height: 500 },
        ],
        viewport: { x: 50, y: 50, zoom: 1.5 },
        savedAt: Date.now(),
      }),
    })

    const res = await fetch(`${baseUrl}/api/layout/board`)
    const data = await res.json()
    expect(data.nodes).toHaveLength(1)
    expect(data.nodes[0].sessionId).toBe('b')
    expect(data.viewport.zoom).toBe(1.5)
  })
})

describe('SessionStore ボードレイアウト', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  afterEach(() => {
    store.close()
  })

  it('ボードレイアウトの保存・取得', () => {
    const state = {
      nodes: [
        { sessionId: 'test-1', x: 10, y: 20, width: 600, height: 400 },
      ],
      edges: [],
      viewport: { x: 100, y: 200, zoom: 0.8 },
      savedAt: Date.now(),
    }

    store.saveBoardLayout(state)
    const loaded = store.getBoardLayout()

    expect(loaded).not.toBeNull()
    expect(loaded!.nodes).toHaveLength(1)
    expect(loaded!.nodes[0].sessionId).toBe('test-1')
    expect(loaded!.nodes[0].x).toBe(10)
    expect(loaded!.viewport.zoom).toBe(0.8)
    expect(loaded!.edges).toEqual([])
  })

  it('ボードエッジの保存・取得', () => {
    const state = {
      nodes: [
        { sessionId: 'session-a', x: 0, y: 0, width: 600, height: 400 },
        { sessionId: 'session-b', x: 700, y: 0, width: 600, height: 400 },
      ],
      edges: [
        { id: 'edge-1', source: 'session-a', target: 'session-b', label: 'テスト接続' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
    }

    store.saveBoardLayout(state)
    const loaded = store.getBoardLayout()

    expect(loaded).not.toBeNull()
    expect(loaded!.edges).toHaveLength(1)
    expect(loaded!.edges[0].id).toBe('edge-1')
    expect(loaded!.edges[0].source).toBe('session-a')
    expect(loaded!.edges[0].target).toBe('session-b')
    expect(loaded!.edges[0].label).toBe('テスト接続')
  })

  it('ボードエッジの更新（追加・削除）', () => {
    // 初回保存
    const state1 = {
      nodes: [
        { sessionId: 's1', x: 0, y: 0, width: 600, height: 400 },
        { sessionId: 's2', x: 700, y: 0, width: 600, height: 400 },
        { sessionId: 's3', x: 350, y: 500, width: 600, height: 400 },
      ],
      edges: [
        { id: 'e1', source: 's1', target: 's2' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
    }
    store.saveBoardLayout(state1)

    // エッジを追加して更新
    const state2 = {
      ...state1,
      edges: [
        { id: 'e1', source: 's1', target: 's2' },
        { id: 'e2', source: 's2', target: 's3' },
      ],
      savedAt: Date.now(),
    }
    store.saveBoardLayout(state2)
    const loaded = store.getBoardLayout()

    expect(loaded!.edges).toHaveLength(2)
    expect(loaded!.edges[1].source).toBe('s2')
    expect(loaded!.edges[1].target).toBe('s3')
  })
})

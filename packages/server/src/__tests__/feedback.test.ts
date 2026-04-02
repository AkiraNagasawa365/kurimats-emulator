import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { SessionStore } from '../services/session-store.js'
import { createFeedbackRouter } from '../routes/feedback.js'

describe('フィードバックAPI', () => {
  let server: Server
  let baseUrl: string
  let store: SessionStore

  beforeEach(async () => {
    store = new SessionStore()
    // テスト前にフィードバックをクリア
    for (const fb of store.getAllFeedback()) {
      store.deleteFeedback(fb.id)
    }

    const app = express()
    app.use(express.json())
    app.use('/api/feedback', createFeedbackRouter(store))

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

  it('フィードバック一覧が空で返る', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`)
    const feedback = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(feedback)).toBe(true)
    expect(feedback.length).toBe(0)
  })

  it('フィードバックを作成できる', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'ダークモード対応',
        detail: '目が疲れるのでダークモードが欲しい',
        category: 'feature_request',
        priority: 'high',
      }),
    })
    const feedback = await res.json()
    expect(res.status).toBe(201)
    expect(feedback.id).toBeDefined()
    expect(feedback.title).toBe('ダークモード対応')
    expect(feedback.detail).toBe('目が疲れるのでダークモードが欲しい')
    expect(feedback.category).toBe('feature_request')
    expect(feedback.priority).toBe('high')
    expect(feedback.createdAt).toBeGreaterThan(0)
  })

  it('タイトルなしだとバリデーションエラー', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '',
        detail: '',
        category: 'feature_request',
        priority: 'medium',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('タイトル')
  })

  it('無効なカテゴリだとバリデーションエラー', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'テスト',
        detail: '',
        category: 'invalid_category',
        priority: 'medium',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('カテゴリ')
  })

  it('フィードバックを削除できる', async () => {
    // 作成
    const createRes = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '削除テスト',
        detail: '',
        category: 'bug_report',
        priority: 'low',
      }),
    })
    const created = await createRes.json()

    // 削除
    const deleteRes = await fetch(`${baseUrl}/api/feedback/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteRes.status).toBe(200)

    // 一覧確認
    const listRes = await fetch(`${baseUrl}/api/feedback`)
    const list = await listRes.json()
    expect(list.length).toBe(0)
  })

  it('存在しないフィードバックの削除は404', async () => {
    const res = await fetch(`${baseUrl}/api/feedback/nonexistent`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(404)
  })

  it('複数フィードバックが新しい順で返る', async () => {
    // 2件作成
    await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '最初', detail: '', category: 'feature_request', priority: 'low' }),
    })
    await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '次', detail: '', category: 'improvement', priority: 'high' }),
    })

    const res = await fetch(`${baseUrl}/api/feedback`)
    const list = await res.json()
    expect(list.length).toBe(2)
    expect(list[0].title).toBe('次')
    expect(list[1].title).toBe('最初')
  })
})

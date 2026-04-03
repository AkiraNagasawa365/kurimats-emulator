import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { CanvasStore } from '../services/canvas-store'
import type { BoardLayoutState } from '@kurimats/shared'

/**
 * Phase 5: キャンバスJSON永続化のテスト
 */
describe('CanvasStore（JSONファイル永続化）', () => {
  let tmpDir: string
  let store: CanvasStore

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'kurimats-test-'))
    store = new CanvasStore(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('初回読み込みはnullを返す', () => {
    expect(store.load()).toBeNull()
  })

  it('キャンバス状態を保存・読み込みできる', () => {
    const state: BoardLayoutState = {
      nodes: [{ sessionId: 's1', x: 100, y: 200, width: 520, height: 620 }],
      fileTiles: [{ id: 'f1', filePath: '/file.ts', language: 'typescript', x: 0, y: 0, width: 500, height: 400 }],
      edges: [{ id: 'e1', source: 's1', target: 's2' }],
      viewport: { x: 50, y: 100, zoom: 0.8 },
      savedAt: Date.now(),
    }

    store.save(state)
    const loaded = store.load()

    expect(loaded).not.toBeNull()
    expect(loaded!.nodes).toHaveLength(1)
    expect(loaded!.nodes[0].sessionId).toBe('s1')
    expect(loaded!.fileTiles).toHaveLength(1)
    expect(loaded!.edges).toHaveLength(1)
    expect(loaded!.viewport).toEqual({ x: 50, y: 100, zoom: 0.8 })
  })

  it('上書き保存が正しく動作する', () => {
    store.save({
      nodes: [{ sessionId: 's1', x: 0, y: 0, width: 520, height: 620 }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
    })

    store.save({
      nodes: [
        { sessionId: 's1', x: 100, y: 200, width: 520, height: 620 },
        { sessionId: 's2', x: 600, y: 200, width: 520, height: 620 },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0.5 },
      savedAt: Date.now(),
    })

    const loaded = store.load()
    expect(loaded!.nodes).toHaveLength(2)
    expect(loaded!.viewport.zoom).toBe(0.5)
  })

  it('ワークスペース別に保存・読み込みできる', () => {
    const stateA: BoardLayoutState = {
      nodes: [{ sessionId: 'a1', x: 0, y: 0, width: 520, height: 620 }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
    }
    const stateB: BoardLayoutState = {
      nodes: [{ sessionId: 'b1', x: 0, y: 0, width: 520, height: 620 }],
      edges: [],
      viewport: { x: 100, y: 100, zoom: 0.5 },
      savedAt: Date.now(),
    }

    const wsIdA = '00000000-0000-0000-0000-000000000001'
    const wsIdB = '00000000-0000-0000-0000-000000000002'
    store.saveWorkspace(wsIdA, stateA)
    store.saveWorkspace(wsIdB, stateB)

    const loadedA = store.loadWorkspace(wsIdA)
    const loadedB = store.loadWorkspace(wsIdB)

    expect(loadedA!.nodes[0].sessionId).toBe('a1')
    expect(loadedB!.nodes[0].sessionId).toBe('b1')
    expect(loadedB!.viewport.zoom).toBe(0.5)
  })

  it('存在しないワークスペースの読み込みはnullを返す', () => {
    expect(store.loadWorkspace('99999999-9999-9999-9999-999999999999')).toBeNull()
  })

  it('不正なワークスペースIDはエラーになる', () => {
    expect(() => store.saveWorkspace('../../etc/passwd', {} as BoardLayoutState)).toThrow('不正なワークスペースID')
    expect(() => store.loadWorkspace('invalid-id')).toThrow('不正なワークスペースID')
  })

  it('データディレクトリパスを取得できる', () => {
    expect(store.getDir()).toBe(tmpDir)
  })
})

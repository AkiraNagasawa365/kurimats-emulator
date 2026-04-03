import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../services/session-store'

/**
 * Phase 3: ワークスペース + プロジェクト管理強化のテスト
 */
describe('ワークスペース', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('ワークスペースを保存できる', () => {
    const nodes = [
      { sessionId: 's1', x: 0, y: 0, width: 520, height: 620 },
      { sessionId: 's2', x: 560, y: 0, width: 520, height: 620 },
    ]
    const edges = [{ id: 'e1', source: 's1', target: 's2' }]
    const viewport = { x: 100, y: 200, zoom: 0.8 }

    const workspace = store.createWorkspace({ name: '開発用' }, nodes, [], edges, viewport)

    expect(workspace.id).toBeDefined()
    expect(workspace.name).toBe('開発用')
    expect(workspace.boardNodes).toHaveLength(2)
    expect(workspace.edges).toHaveLength(1)
    expect(workspace.viewport).toEqual(viewport)
  })

  it('ファイルタイル付きで保存できる', () => {
    const fileTiles = [
      { id: 'f1', filePath: '/path/to/file.ts', language: 'typescript', x: 0, y: 0, width: 500, height: 400 },
    ]
    const workspace = store.createWorkspace({ name: 'レビュー用' }, [], fileTiles, [], { x: 0, y: 0, zoom: 1 })

    expect(workspace.fileTiles).toHaveLength(1)
    expect(workspace.fileTiles![0].filePath).toBe('/path/to/file.ts')
  })

  it('全ワークスペースを取得できる', () => {
    store.createWorkspace({ name: 'WS1' }, [], [], [], { x: 0, y: 0, zoom: 1 })
    store.createWorkspace({ name: 'WS2' }, [], [], [], { x: 0, y: 0, zoom: 1 })

    expect(store.getAllWorkspaces()).toHaveLength(2)
  })

  it('IDでワークスペースを取得できる', () => {
    const created = store.createWorkspace({ name: 'テスト' }, [], [], [], { x: 0, y: 0, zoom: 1 })
    const found = store.getWorkspace(created.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('テスト')
  })

  it('ワークスペースを削除できる', () => {
    const created = store.createWorkspace({ name: '削除用' }, [], [], [], { x: 0, y: 0, zoom: 1 })
    expect(store.deleteWorkspace(created.id)).toBe(true)
    expect(store.getWorkspace(created.id)).toBeNull()
  })

  it('存在しないワークスペースの削除はfalseを返す', () => {
    expect(store.deleteWorkspace('nonexistent')).toBe(false)
  })
})

describe('プロジェクトSSH紐付けAPI', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('プロジェクト更新でsshPresetIdとstartupTemplateIdを設定できる', () => {
    const project = store.createProject({ name: 'PJ', color: '#3b82f6', repoPath: '/path' })
    const preset = store.createSshPreset({ name: 'サーバー', hostname: 'example.com', user: 'root', defaultCwd: '~' })
    const template = store.createStartupTemplate({ name: 'テンプレート', commands: ['claude'] })

    store.setProjectSshPreset(project.id, preset.id)
    store.setProjectStartupTemplate(project.id, template.id)

    const updated = store.getAllProjects().find(p => p.id === project.id)!
    expect(updated.sshPresetId).toBe(preset.id)
    expect(updated.startupTemplateId).toBe(template.id)
  })
})

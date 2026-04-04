import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../services/session-store'
import type { PaneLeaf } from '@kurimats/shared'

/** テスト用のデフォルトペインツリー */
function defaultPaneTree(): PaneLeaf {
  return {
    kind: 'leaf',
    id: 'test-pane-1',
    surfaces: [],
    activeSurfaceIndex: 0,
    ratio: 0.5,
  }
}

describe('cmuxワークスペース', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('ワークスペースを作成できる', () => {
    const workspace = store.createCmuxWorkspace({ name: '開発用' }, defaultPaneTree())

    expect(workspace.id).toBeDefined()
    expect(workspace.name).toBe('開発用')
    expect(workspace.paneTree.kind).toBe('leaf')
    expect(workspace.activePaneId).toBe('test-pane-1')
    expect(workspace.isPinned).toBe(false)
  })

  it('全ワークスペースを取得できる', () => {
    store.createCmuxWorkspace({ name: 'WS1' }, defaultPaneTree())
    store.createCmuxWorkspace({ name: 'WS2' }, defaultPaneTree())

    expect(store.getAllCmuxWorkspaces()).toHaveLength(2)
  })

  it('IDでワークスペースを取得できる', () => {
    const created = store.createCmuxWorkspace({ name: 'テスト' }, defaultPaneTree())
    const found = store.getCmuxWorkspace(created.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('テスト')
  })

  it('ワークスペース名を変更できる', () => {
    const created = store.createCmuxWorkspace({ name: '旧名' }, defaultPaneTree())
    const updated = store.renameCmuxWorkspace(created.id, '新名')
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('新名')
  })

  it('ピン留めをトグルできる', () => {
    const created = store.createCmuxWorkspace({ name: 'ピン' }, defaultPaneTree())
    expect(created.isPinned).toBe(false)

    const pinned = store.toggleCmuxWorkspacePin(created.id)
    expect(pinned!.isPinned).toBe(true)

    const unpinned = store.toggleCmuxWorkspacePin(created.id)
    expect(unpinned!.isPinned).toBe(false)
  })

  it('ペインツリーを更新できる', () => {
    const created = store.createCmuxWorkspace({ name: 'レイアウト' }, defaultPaneTree())

    const newTree: PaneLeaf = {
      kind: 'leaf',
      id: 'new-pane',
      surfaces: [{ id: 's1', type: 'terminal', target: 'session-1', label: 'Terminal' }],
      activeSurfaceIndex: 0,
      ratio: 0.5,
    }

    store.updateCmuxPaneTree(created.id, newTree, 'new-pane')
    const updated = store.getCmuxWorkspace(created.id)
    expect(updated!.activePaneId).toBe('new-pane')
    expect(updated!.paneTree.kind).toBe('leaf')
    if (updated!.paneTree.kind === 'leaf') {
      expect(updated!.paneTree.surfaces).toHaveLength(1)
    }
  })

  it('ワークスペースを削除できる', () => {
    const created = store.createCmuxWorkspace({ name: '削除用' }, defaultPaneTree())
    expect(store.deleteCmuxWorkspace(created.id)).toBe(true)
    expect(store.getCmuxWorkspace(created.id)).toBeNull()
  })

  it('存在しないワークスペースの削除はfalseを返す', () => {
    expect(store.deleteCmuxWorkspace('nonexistent')).toBe(false)
  })

  it('ワークスペース削除時にセッションのworkspace_idがnullになる', () => {
    const ws = store.createCmuxWorkspace({ name: 'WS' }, defaultPaneTree())
    const session = store.create({
      name: 'セッション',
      repoPath: '/path',
      workspaceId: ws.id,
    })

    expect(store.getById(session.id)!.workspaceId).toBe(ws.id)

    store.deleteCmuxWorkspace(ws.id)
    expect(store.getById(session.id)!.workspaceId).toBeNull()
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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../services/session-store'
import type { PaneLeaf, PaneSplit, PaneNode } from '@kurimats/shared'

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
    const workspace = store.createCmuxWorkspace({ name: '開発用', repoPath: '/tmp/test-repo' }, defaultPaneTree())

    expect(workspace.id).toBeDefined()
    expect(workspace.name).toBe('開発用')
    expect(workspace.paneTree.kind).toBe('leaf')
    expect(workspace.activePaneId).toBe('test-pane-1')
    expect(workspace.isPinned).toBe(false)
  })

  it('全ワークスペースを取得できる', () => {
    store.createCmuxWorkspace({ name: 'WS1', repoPath: '/tmp/test-repo' }, defaultPaneTree())
    store.createCmuxWorkspace({ name: 'WS2', repoPath: '/tmp/test-repo' }, defaultPaneTree())

    expect(store.getAllCmuxWorkspaces()).toHaveLength(2)
  })

  it('IDでワークスペースを取得できる', () => {
    const created = store.createCmuxWorkspace({ name: 'テスト', repoPath: '/tmp/test-repo' }, defaultPaneTree())
    const found = store.getCmuxWorkspace(created.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('テスト')
  })

  it('ワークスペース名を変更できる', () => {
    const created = store.createCmuxWorkspace({ name: '旧名', repoPath: '/tmp/test-repo' }, defaultPaneTree())
    const updated = store.renameCmuxWorkspace(created.id, '新名')
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('新名')
  })

  it('ピン留めをトグルできる', () => {
    const created = store.createCmuxWorkspace({ name: 'ピン', repoPath: '/tmp/test-repo' }, defaultPaneTree())
    expect(created.isPinned).toBe(false)

    const pinned = store.toggleCmuxWorkspacePin(created.id)
    expect(pinned!.isPinned).toBe(true)

    const unpinned = store.toggleCmuxWorkspacePin(created.id)
    expect(unpinned!.isPinned).toBe(false)
  })

  it('ペインツリーを更新できる', () => {
    const created = store.createCmuxWorkspace({ name: 'レイアウト', repoPath: '/tmp/test-repo' }, defaultPaneTree())

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
    const created = store.createCmuxWorkspace({ name: '削除用', repoPath: '/tmp/test-repo' }, defaultPaneTree())
    expect(store.deleteCmuxWorkspace(created.id)).toBe(true)
    expect(store.getCmuxWorkspace(created.id)).toBeNull()
  })

  it('存在しないワークスペースの削除はfalseを返す', () => {
    expect(store.deleteCmuxWorkspace('nonexistent')).toBe(false)
  })

  it('repoPathを保持して作成できる', () => {
    const ws = store.createCmuxWorkspace({ name: 'repo-test', repoPath: '/home/user/myrepo' }, defaultPaneTree())
    expect(ws.repoPath).toBe('/home/user/myrepo')
    expect(ws.sshHost).toBeNull()

    const fetched = store.getCmuxWorkspace(ws.id)
    expect(fetched!.repoPath).toBe('/home/user/myrepo')
  })

  it('sshHost付きで作成できる', () => {
    const ws = store.createCmuxWorkspace(
      { name: 'ssh-test', repoPath: '/data1/project', sshHost: 'elith-remote' },
      defaultPaneTree(),
    )
    expect(ws.repoPath).toBe('/data1/project')
    expect(ws.sshHost).toBe('elith-remote')

    const fetched = store.getCmuxWorkspace(ws.id)
    expect(fetched!.sshHost).toBe('elith-remote')
  })

  it('assignWorkspaceでセッションのworkspace_idを更新できる', () => {
    const ws = store.createCmuxWorkspace({ name: 'assign-test', repoPath: '/tmp/test' }, defaultPaneTree())
    const session = store.create({ name: 'sess', repoPath: '/tmp/test' })
    expect(store.getById(session.id)!.workspaceId).toBeNull()

    store.assignWorkspace(session.id, ws.id)
    expect(store.getById(session.id)!.workspaceId).toBe(ws.id)
  })

  it('指定したIDでワークスペースを作成できる', () => {
    const ws = store.createCmuxWorkspace({ name: 'fixed-id', repoPath: '/tmp/test' }, defaultPaneTree(), 'ws-fixed')
    expect(ws.id).toBe('ws-fixed')
    expect(store.getCmuxWorkspace('ws-fixed')?.id).toBe('ws-fixed')
  })

  it('ワークスペース削除時にセッションのworkspace_idがnullになる', () => {
    const ws = store.createCmuxWorkspace({ name: 'WS', repoPath: '/tmp/test-repo' }, defaultPaneTree())
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

describe('ペイン閉じ時のセッション1:1整合��', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('ペインツリー更新でリーフを削除してもセッションはDB上に残る（APIで明示削除が必要）', () => {
    const ws = store.createCmuxWorkspace({ name: 'WS', repoPath: '/tmp/test' }, defaultPaneTree())
    const session = store.create({ name: 'sess', repoPath: '/tmp/test', workspaceId: ws.id })

    // ペインツリーに2リーフを持つスプリットを設定
    const leaf1: PaneLeaf = {
      kind: 'leaf',
      id: 'pane-1',
      surfaces: [{ id: 's1', type: 'terminal', target: session.id, label: 'Term 1' }],
      activeSurfaceIndex: 0,
      ratio: 0.5,
    }
    const leaf2: PaneLeaf = {
      kind: 'leaf',
      id: 'pane-2',
      surfaces: [],
      activeSurfaceIndex: 0,
      ratio: 0.5,
    }
    const splitTree: PaneSplit = {
      kind: 'split',
      id: 'split-1',
      direction: 'vertical',
      ratio: 0.5,
      children: [leaf1, leaf2],
    }

    store.updateCmuxPaneTree(ws.id, splitTree, 'pane-1')

    // pane-2を閉じてpane-1だけ残す
    store.updateCmuxPaneTree(ws.id, leaf1, 'pane-1')

    // セッションはDBに残っている（close-pane APIで明示削除する設計）
    expect(store.getById(session.id)).not.toBeNull()
  })

  it('ワークスペース削除後もセッション自体はDBに残る（workspace_idがnull化）', () => {
    const ws = store.createCmuxWorkspace({ name: 'WS', repoPath: '/tmp/test' }, defaultPaneTree())
    const session = store.create({ name: 'sess', repoPath: '/tmp/test', workspaceId: ws.id })

    store.deleteCmuxWorkspace(ws.id)

    // セッションは残っている（PTY/worktree削除はルーター層の責務）
    const remaining = store.getById(session.id)
    expect(remaining).not.toBeNull()
    expect(remaining!.workspaceId).toBeNull()
  })

  it('セッションがターミナルサーフェスのtargetとして正しく紐づく', () => {
    const ws = store.createCmuxWorkspace({ name: 'WS', repoPath: '/tmp/test' }, defaultPaneTree())
    const session = store.create({ name: 'sess', repoPath: '/tmp/test', workspaceId: ws.id })

    const leafWithTerminal: PaneLeaf = {
      kind: 'leaf',
      id: 'pane-1',
      surfaces: [{ id: 's1', type: 'terminal', target: session.id, label: session.name }],
      activeSurfaceIndex: 0,
      ratio: 0.5,
    }

    store.updateCmuxPaneTree(ws.id, leafWithTerminal, 'pane-1')

    const updated = store.getCmuxWorkspace(ws.id)!
    const tree = updated.paneTree as PaneLeaf
    expect(tree.surfaces[0].target).toBe(session.id)
    expect(tree.surfaces[0].type).toBe('terminal')
  })
})

describe('孤立セッションクリーンアップ', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  /** ペインツリーからセッションIDを収集（index.tsの起動時ロジックと同じ） */
  function collectSessionIdsFromTree(node: PaneNode): string[] {
    if (!node) return []
    if (node.kind === 'leaf') {
      return node.surfaces.filter(s => s.type === 'terminal').map(s => s.target)
    }
    if (!node.children || node.children.length < 2) return []
    return [...collectSessionIdsFromTree(node.children[0]), ...collectSessionIdsFromTree(node.children[1])]
  }

  it('ペインツリーに含まれないセッションが孤立として検出される', () => {
    // ペインツリーに含まれるセッション
    const referenced = store.create({ name: 'referenced', repoPath: '/tmp' })
    // ペインツリーに含まれないセッション（孤立）
    const orphaned = store.create({ name: 'orphaned', repoPath: '/tmp' })

    const tree: PaneLeaf = {
      kind: 'leaf',
      id: 'pane-1',
      surfaces: [{ id: 's1', type: 'terminal', target: referenced.id, label: 'Term' }],
      activeSurfaceIndex: 0,
      ratio: 0.5,
    }
    store.createCmuxWorkspace({ name: 'WS', repoPath: '/tmp' }, tree)

    // クリーンアップロジック
    const workspaces = store.getAllCmuxWorkspaces()
    const referencedIds = new Set<string>()
    for (const ws of workspaces) {
      for (const id of collectSessionIdsFromTree(ws.paneTree)) {
        referencedIds.add(id)
      }
    }

    const allSessions = store.getAll()
    const orphanedSessions = allSessions.filter(s => !referencedIds.has(s.id))

    expect(orphanedSessions).toHaveLength(1)
    expect(orphanedSessions[0].id).toBe(orphaned.id)

    // 孤立セッションを削除
    for (const s of orphanedSessions) {
      store.delete(s.id)
    }

    expect(store.getById(orphaned.id)).toBeNull()
    expect(store.getById(referenced.id)).not.toBeNull()
  })

  it('スプリットツリーの全リーフからセッションIDを収集できる', () => {
    const s1 = store.create({ name: 's1', repoPath: '/tmp' })
    const s2 = store.create({ name: 's2', repoPath: '/tmp' })
    const s3 = store.create({ name: 's3', repoPath: '/tmp' })

    const splitTree: PaneSplit = {
      kind: 'split',
      id: 'split-1',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        {
          kind: 'leaf',
          id: 'pane-1',
          surfaces: [{ id: 's1', type: 'terminal', target: s1.id, label: 'T1' }],
          activeSurfaceIndex: 0,
          ratio: 0.5,
        },
        {
          kind: 'split',
          id: 'split-2',
          direction: 'horizontal',
          ratio: 0.5,
          children: [
            {
              kind: 'leaf',
              id: 'pane-2',
              surfaces: [{ id: 's2', type: 'terminal', target: s2.id, label: 'T2' }],
              activeSurfaceIndex: 0,
              ratio: 0.5,
            },
            {
              kind: 'leaf',
              id: 'pane-3',
              surfaces: [{ id: 's3', type: 'terminal', target: s3.id, label: 'T3' }],
              activeSurfaceIndex: 0,
              ratio: 0.5,
            },
          ],
        },
      ],
    }

    const ids = collectSessionIdsFromTree(splitTree)
    expect(ids).toHaveLength(3)
    expect(ids).toContain(s1.id)
    expect(ids).toContain(s2.id)
    expect(ids).toContain(s3.id)
  })

  it('壊れたペインツリーでもクラッシュしない', () => {
    // null/undefinedガードのテスト
    expect(collectSessionIdsFromTree(null as unknown as PaneNode)).toEqual([])
    expect(collectSessionIdsFromTree({ kind: 'split', id: 'broken', direction: 'vertical', ratio: 0.5 } as unknown as PaneNode)).toEqual([])
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

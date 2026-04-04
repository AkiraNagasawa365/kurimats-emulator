import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { PtyManager } from '../services/pty-manager.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { PaneNode, PaneLeaf, Surface, SplitDirection, Session } from '@kurimats/shared'
import { waitForShellReady } from './sessions.js'

/** 一意なID生成 */
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** セッションを作成し、PTY/SSHを起動してClaude Codeを自動実行する */
async function createSessionWithClaude(
  store: SessionStore,
  ptyManager: PtyManager,
  sshManager: SshManager,
  worktreeService: WorktreeService,
  params: {
    name: string
    repoPath: string
    sshHost?: string | null
    useWorktree?: boolean
    baseBranch?: string
    workspaceId: string
  },
): Promise<{ session: Session; surface: Surface; paneId: string }> {
  const isRemote = !!params.sshHost

  // ワークツリー作成（ローカルセッションのみ）
  let worktreePath: string | null = null
  if (!isRemote && params.useWorktree !== false) {
    try {
      const isGit = worktreeService.isGitRepo(params.repoPath)
      if (isGit) {
        const wtName = params.name.replace(/\s+/g, '-').toLowerCase()
        worktreePath = await worktreeService.create(
          params.repoPath,
          wtName,
          params.baseBranch,
        )
        console.log(`📁 ワークツリー作成: ${worktreePath}`)
      }
    } catch (e) {
      console.warn(`⚠️ ワークツリー作成スキップ: ${e}`)
    }
  }

  // セッション作成（DB保存）
  const session = store.create({
    name: params.name,
    repoPath: params.repoPath,
    baseBranch: params.baseBranch,
    worktreePath,
    sshHost: params.sshHost ?? null,
    isRemote,
    workspaceId: params.workspaceId,
  })

  const cwd = worktreePath || params.repoPath

  // PTY/SSH起動
  try {
    await ptyManager.initialize()

    if (isRemote && params.sshHost) {
      // SSH経由
      await sshManager.connect(params.sshHost)
      await sshManager.spawn(session.id, params.sshHost, cwd, 120, 30)
      waitForShellReady(session.id, ptyManager, sshManager, true)
    } else {
      // ローカルPTY
      const backend = ptyManager.backend
      if (backend === 'node-pty') {
        const shell = process.env.SHELL || '/bin/zsh'
        await ptyManager.spawn(session.id, cwd, 120, 30, shell, [])
        waitForShellReady(session.id, ptyManager, sshManager, false)
      } else {
        await ptyManager.spawn(session.id, cwd, 120, 30, 'claude', [])
      }
    }
  } catch (e) {
    console.error(`PTY/SSH起動エラー:`, e)
    try { store.delete(session.id) } catch { /* ignore */ }
    throw e
  }

  // サーフェス・ペイン情報を返す
  const paneId = genId('pane')
  const surface: Surface = {
    id: genId('surface'),
    type: 'terminal',
    target: session.id,
    label: session.name,
  }

  return { session, surface, paneId }
}

export function createWorkspacesRouter(
  store: SessionStore,
  ptyManager: PtyManager,
  sshManager: SshManager,
  worktreeService: WorktreeService,
): Router {
  const router = Router()

  // 全ワークスペース取得
  router.get('/', (_req, res) => {
    res.json(store.getAllCmuxWorkspaces())
  })

  // ワークスペース取得
  router.get('/:id', (req, res) => {
    const workspace = store.getCmuxWorkspace(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  // ワークスペース作成（セッション+Claude Code自動起動付き）
  router.post('/', async (req, res) => {
    const { repoPath, projectId, sshHost, useWorktree, baseBranch } = req.body
    if (!repoPath) {
      res.status(400).json({ error: 'リポジトリパスは必須です' })
      return
    }
    // 名前が未指定ならパスの末尾をデフォルト名にする
    const name = req.body.name || repoPath.split('/').filter(Boolean).pop() || 'workspace'

    try {
      // 仮のワークスペースIDを先に生成
      const tempWsId = genId('ws')

      // セッション+PTY/SSH+Claude Code起動
      const { session, surface, paneId } = await createSessionWithClaude(
        store, ptyManager, sshManager, worktreeService,
        {
          name: `${name}-main`,
          repoPath,
          sshHost,
          useWorktree,
          baseBranch,
          workspaceId: tempWsId,
        },
      )

      // ペインツリー（初期状態: 1リーフ + ターミナルサーフェス）
      const paneTree: PaneLeaf = {
        kind: 'leaf',
        id: paneId,
        surfaces: [surface],
        activeSurfaceIndex: 0,
        ratio: 0.5,
      }

      // ワークスペース作成（DB保存）
      const workspace = store.createCmuxWorkspace(
        { name, projectId, repoPath, sshHost },
        paneTree,
      )

      // セッションのworkspace_idを正しいIDに更新
      store.assignWorkspace(session.id, workspace.id)

      res.status(201).json(workspace)
    } catch (e) {
      console.error('ワークスペース作成エラー:', e)
      res.status(500).json({ error: `ワークスペース作成に失敗: ${e}` })
    }
  })

  // ペイン分割（新セッション+worktree+Claude Code自動作成）
  // sshHost/repoPath を指定すると、WSのデフォルトを上書きできる（異なるホスト/パスで分割）
  router.post('/:id/split-pane', async (req, res) => {
    const { paneId, direction, sshHost: overrideSshHost, repoPath: overrideRepoPath } = req.body as {
      paneId: string
      direction: SplitDirection
      sshHost?: string | null
      repoPath?: string | null
    }
    if (!paneId || !direction) {
      res.status(400).json({ error: 'paneId と direction は必須です' })
      return
    }

    const workspace = store.getCmuxWorkspace(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }

    // 指定があればオーバーライド、なければWSのデフォルト
    const effectiveSshHost = overrideSshHost !== undefined ? overrideSshHost : workspace.sshHost
    const effectiveRepoPath = overrideRepoPath || workspace.repoPath
    const isRemotePane = !!effectiveSshHost

    try {
      // ペイン数をカウントしてユニーク名を作成
      const paneCount = countLeaves(workspace.paneTree)
      const sessionName = `${workspace.name}-pane${paneCount + 1}`

      // 新セッション+PTY/SSH+Claude Code起動（独自worktree付き）
      const { session, surface, paneId: newPaneId } = await createSessionWithClaude(
        store, ptyManager, sshManager, worktreeService,
        {
          name: sessionName,
          repoPath: effectiveRepoPath,
          sshHost: effectiveSshHost,
          useWorktree: !isRemotePane, // リモートの場合はworktree不要
          workspaceId: workspace.id,
        },
      )

      // ペインツリーを分割
      const newLeaf: PaneLeaf = {
        kind: 'leaf',
        id: newPaneId,
        surfaces: [surface],
        activeSurfaceIndex: 0,
        ratio: 0.5,
      }

      const newTree = splitLeafInTree(workspace.paneTree, paneId, direction, newLeaf)
      if (!newTree) {
        res.status(400).json({ error: '指定されたペインが見つかりません' })
        return
      }

      // DB更新
      store.updateCmuxPaneTree(workspace.id, newTree, newPaneId)

      res.json({
        paneTree: newTree,
        activePaneId: newPaneId,
        newSession: session,
      })
    } catch (e) {
      console.error('ペイン分割エラー:', e)
      res.status(500).json({ error: `ペイン分割に失敗: ${e}` })
    }
  })

  // ワークスペース名変更
  router.patch('/:id', (req, res) => {
    const { name } = req.body
    if (!name) {
      res.status(400).json({ error: '名前は必須です' })
      return
    }
    const workspace = store.renameCmuxWorkspace(req.params.id, name)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  // ピン留めトグル
  router.post('/:id/pin', (req, res) => {
    const workspace = store.toggleCmuxWorkspacePin(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json(workspace)
  })

  // ペインツリー更新（クライアント側のリサイズ等）
  router.put('/:id/pane-tree', (req, res) => {
    const { paneTree, activePaneId } = req.body as { paneTree: PaneNode; activePaneId: string }
    if (!paneTree || !activePaneId) {
      res.status(400).json({ error: 'paneTree と activePaneId は必須です' })
      return
    }
    store.updateCmuxPaneTree(req.params.id, paneTree, activePaneId)
    res.json({ ok: true })
  })

  // ワークスペース削除
  router.delete('/:id', (req, res) => {
    const deleted = store.deleteCmuxWorkspace(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }
    res.json({ ok: true })
  })

  return router
}

// ========== ペインツリー操作ヘルパー ==========

/** ツリー内のリーフ数をカウント */
function countLeaves(node: PaneNode): number {
  if (node.kind === 'leaf') return 1
  return countLeaves(node.children[0]) + countLeaves(node.children[1])
}

/** ツリー内の指定リーフを分割して新しいツリーを返す */
function splitLeafInTree(
  tree: PaneNode,
  leafId: string,
  direction: SplitDirection,
  newLeaf: PaneLeaf,
): PaneNode | null {
  if (tree.kind === 'leaf') {
    if (tree.id === leafId) {
      return {
        kind: 'split',
        id: genId('split'),
        direction,
        children: [{ ...tree, ratio: 0.5 }, newLeaf],
      }
    }
    return null // 見つからない
  }

  // スプリットノードの子を再帰探索
  const newFirst = splitLeafInTree(tree.children[0], leafId, direction, newLeaf)
  if (newFirst) {
    return { ...tree, children: [newFirst, tree.children[1]] }
  }

  const newSecond = splitLeafInTree(tree.children[1], leafId, direction, newLeaf)
  if (newSecond) {
    return { ...tree, children: [tree.children[0], newSecond] }
  }

  return null
}

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
        await ptyManager.spawn(session.id, cwd, 120, 30, 'claude', ['--continue'])
      }
    }
  } catch (e) {
    console.error(`PTY/SSH起動エラー:`, e)
    if (sshManager.hasSession(session.id)) {
      sshManager.kill(session.id)
    } else {
      ptyManager.kill(session.id)
    }
    try { store.delete(session.id) } catch { /* ignore */ }
    if (worktreePath) {
      try {
        worktreeService.remove(params.repoPath, worktreePath)
      } catch {
        // ignore cleanup errors
      }
    }
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

    // 同じrepoPath+sshHostの既存WSがあれば重複エラー
    const existing = store.getAllCmuxWorkspaces().find(
      w => w.repoPath === repoPath && (w.sshHost ?? null) === (sshHost ?? null),
    )
    if (existing) {
      res.status(409).json({ error: '同じプロジェクトのワークスペースが既に存在します', existingId: existing.id })
      return
    }

  try {
      // 仮のワークスペースIDを先に生成
      const workspaceId = genId('ws')

      // セッション+PTY/SSH+Claude Code起動
      const { session, surface, paneId } = await createSessionWithClaude(
        store, ptyManager, sshManager, worktreeService,
        {
          name: `${name}-main`,
          repoPath,
          sshHost,
          useWorktree,
          baseBranch,
          workspaceId,
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
        workspaceId,
      )

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
    if (!containsLeafId(workspace.paneTree, paneId)) {
      res.status(400).json({ error: '指定されたペインが見つかりません' })
      return
    }

    // 指定があればオーバーライド、なければWSのデフォルト
    const effectiveSshHost = overrideSshHost !== undefined ? overrideSshHost : workspace.sshHost
    const effectiveRepoPath = overrideRepoPath || workspace.repoPath
    const isRemotePane = !!effectiveSshHost

    let session: Session | null = null
    try {
      // ペイン数をカウントしてユニーク名を作成
      const paneCount = countLeaves(workspace.paneTree)
      const sessionName = `${workspace.name}-pane${paneCount + 1}`

      // 新セッション+PTY/SSH+Claude Code起動（独自worktree付き）
      const created = await createSessionWithClaude(
        store, ptyManager, sshManager, worktreeService,
        {
          name: sessionName,
          repoPath: effectiveRepoPath,
          sshHost: effectiveSshHost,
          useWorktree: !isRemotePane, // リモートの場合はworktree不要
          workspaceId: workspace.id,
        },
      )
      session = created.session
      const { surface, paneId: newPaneId } = created

      // ペインツリーを分割
      const newLeaf: PaneLeaf = {
        kind: 'leaf',
        id: newPaneId,
        surfaces: [surface],
        activeSurfaceIndex: 0,
        ratio: 0.5,
      }

      const splitTree = splitLeafInTree(workspace.paneTree, paneId, direction, newLeaf)
      if (!splitTree) {
        if (sshManager.hasSession(session.id)) {
          sshManager.kill(session.id)
        } else {
          ptyManager.kill(session.id)
        }
        store.delete(session.id)
        res.status(400).json({ error: '指定されたペインが見つかりません' })
        return
      }

      // 全ペインが等分になるようratioを再計算
      const newTree = rebalanceRatios(splitTree)

      // DB更新
      store.updateCmuxPaneTree(workspace.id, newTree, newPaneId)

      res.json({
        paneTree: newTree,
        activePaneId: newPaneId,
        newSession: session,
      })
    } catch (e) {
      if (session) {
        if (sshManager.hasSession(session.id)) {
          sshManager.kill(session.id)
        } else {
          ptyManager.kill(session.id)
        }
        try {
          store.delete(session.id)
        } catch {
          // ignore cleanup errors
        }
      }
      console.error('ペイン分割エラー:', e)
      res.status(500).json({ error: `ペイン分割に失敗: ${e}` })
    }
  })

  // ペイン閉じ（セッション/PTY/worktreeも連動削除）
  router.post('/:id/close-pane', (req, res) => {
    const { paneId } = req.body as { paneId: string }
    if (!paneId) {
      res.status(400).json({ error: 'paneId は必須です' })
      return
    }

    const workspace = store.getCmuxWorkspace(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }

    // 最後のペインは閉じない
    if (countLeaves(workspace.paneTree) <= 1) {
      res.status(400).json({ error: '最後のペインは閉じられません' })
      return
    }

    // 閉じるペインからセッションIDを取得
    const targetLeaf = findLeaf(workspace.paneTree, paneId)
    if (!targetLeaf) {
      res.status(400).json({ error: '指定されたペインが見つかりません' })
      return
    }

    // ターミナルサーフェスに紐づくセッションIDを取得
    const terminalSurface = targetLeaf.surfaces.find(s => s.type === 'terminal')
    const sessionId = terminalSurface?.target ?? null

    // ペインツリーからリーフを削除
    const newTree = closeLeafInTree(workspace.paneTree, paneId)
    if (!newTree) {
      res.status(500).json({ error: 'ペインツリー更新に失敗しました' })
      return
    }

    const rebalanced = rebalanceRatios(newTree)
    const newActivePaneId = workspace.activePaneId === paneId
      ? findFirstLeafId(rebalanced)
      : workspace.activePaneId

    // DB更新
    store.updateCmuxPaneTree(workspace.id, rebalanced, newActivePaneId)

    // セッション/PTY/worktreeをクリーンアップ
    if (sessionId) {
      cleanupSession(store, ptyManager, sshManager, worktreeService, sessionId)
    }

    res.json({
      paneTree: rebalanced,
      activePaneId: newActivePaneId,
      deletedSessionId: sessionId,
    })
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

  // ワークスペース削除（全セッション/PTY/worktreeも連動クリーンアップ）
  router.delete('/:id', (req, res) => {
    const workspace = store.getCmuxWorkspace(req.params.id)
    if (!workspace) {
      res.status(404).json({ error: 'ワークスペースが見つかりません' })
      return
    }

    // ペインツリー内の全セッションをクリーンアップ
    const sessionIds = collectSessionIds(workspace.paneTree)
    for (const sessionId of sessionIds) {
      cleanupSession(store, ptyManager, sshManager, worktreeService, sessionId)
    }

    const deleted = store.deleteCmuxWorkspace(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'ワークスペース削除に失敗しました' })
      return
    }
    res.json({ ok: true, deletedSessionIds: sessionIds })
  })

  return router
}

// ========== セッションクリーンアップ ==========

/** セッションのPTY/SSH kill + worktree削除 + DB削除 */
function cleanupSession(
  store: SessionStore,
  ptyManager: PtyManager,
  sshManager: SshManager,
  worktreeService: WorktreeService,
  sessionId: string,
): void {
  const session = store.getById(sessionId)
  if (!session) return

  // PTY/SSH kill
  if (sshManager.hasSession(sessionId)) {
    sshManager.kill(sessionId)
  } else {
    ptyManager.kill(sessionId)
  }

  // worktree削除
  if (session.worktreePath && session.repoPath) {
    try {
      worktreeService.remove(session.repoPath, session.worktreePath)
      console.log(`🗑️ worktree削除: ${session.worktreePath}`)
    } catch (e) {
      console.warn(`⚠️ worktree削除エラー (無視): ${e}`)
    }
  }

  // DB削除
  store.delete(sessionId)
}

/** ペインツリーから全ターミナルサーフェスのセッションIDを収集 */
function collectSessionIds(node: PaneNode): string[] {
  if (node.kind === 'leaf') {
    return node.surfaces
      .filter(s => s.type === 'terminal')
      .map(s => s.target)
  }
  return [
    ...collectSessionIds(node.children[0]),
    ...collectSessionIds(node.children[1]),
  ]
}

// ========== ペインツリー操作ヘルパー ==========

/** 全ペインが等分になるようratioを再計算 */
function rebalanceRatios(tree: PaneNode): PaneNode {
  if (tree.kind === 'leaf') return tree
  const [first, second] = tree.children
  const firstCount = countLeaves(first)
  const total = firstCount + countLeaves(second)
  const firstRatio = firstCount / total
  const newFirst = rebalanceRatios(first)
  const newSecond = rebalanceRatios(second)
  return {
    ...tree,
    children: [
      { ...newFirst, ratio: firstRatio },
      { ...newSecond, ratio: 1 - firstRatio },
    ],
  } as PaneNode
}

/** ツリー内のリーフ数をカウント */
function countLeaves(node: PaneNode): number {
  if (node.kind === 'leaf') return 1
  return countLeaves(node.children[0]) + countLeaves(node.children[1])
}

/** IDでリーフを検索 */
function findLeaf(node: PaneNode, leafId: string): PaneLeaf | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  return findLeaf(node.children[0], leafId) ?? findLeaf(node.children[1], leafId)
}

/** リーフを閉じて兄弟を昇格（closeLeafと同等のサーバー側実装） */
function closeLeafInTree(tree: PaneNode, leafId: string): PaneNode | null {
  if (tree.kind === 'leaf') {
    return tree.id === leafId ? null : tree
  }

  const [first, second] = tree.children

  if (first.id === leafId) return second.kind === 'leaf' ? { ...second, ratio: 0.5 } : second
  if (second.id === leafId) return first.kind === 'leaf' ? { ...first, ratio: 0.5 } : first

  const newFirst = closeLeafInTree(first, leafId)
  if (newFirst !== first) {
    if (newFirst === null) return second.kind === 'leaf' ? { ...second, ratio: 0.5 } : second
    return { ...tree, children: [newFirst, second] }
  }

  const newSecond = closeLeafInTree(second, leafId)
  if (newSecond !== second) {
    if (newSecond === null) return first.kind === 'leaf' ? { ...first, ratio: 0.5 } : first
    return { ...tree, children: [first, newSecond] }
  }

  return tree
}

/** ツリーの最初のリーフIDを取得 */
function findFirstLeafId(node: PaneNode): string {
  if (node.kind === 'leaf') return node.id
  return findFirstLeafId(node.children[0])
}

function containsLeafId(node: PaneNode, leafId: string): boolean {
  if (node.kind === 'leaf') return node.id === leafId
  return containsLeafId(node.children[0], leafId) || containsLeafId(node.children[1], leafId)
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
        ratio: 0.5,
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

import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { PtyManager } from '../services/pty-manager.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { PaneNode, PaneLeaf, SplitDirection, Session } from '@kurimats/shared'
import { createAndSpawnSession, cleanupSession } from '../services/session-lifecycle.js'
import {
  genId,
  collectSessionIds,
  countLeaves,
  findLeaf,
  findFirstLeafId,
  containsLeafId,
  rebalanceRatios,
  splitLeafInTree,
  closeLeafInTree,
} from '../utils/pane-tree.js'

/** セッションを作成し、PTY/SSHを起動してClaude Codeを自動実行する */
async function createWorkspaceSession(
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
): Promise<{ session: Session; paneId: string }> {
  const session = await createAndSpawnSession(
    store, ptyManager, sshManager, worktreeService,
    {
      name: params.name,
      repoPath: params.repoPath,
      sshHost: params.sshHost,
      useWorktree: params.useWorktree,
      baseBranch: params.baseBranch,
      workspaceId: params.workspaceId,
    },
  )

  const paneId = genId('pane')
  return { session, paneId }
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
      const { session, paneId } = await createWorkspaceSession(
        store, ptyManager, sshManager, worktreeService,
        {
          name: `${name}-pane1`,
          repoPath,
          sshHost,
          useWorktree,
          baseBranch,
          workspaceId,
        },
      )

      // ペインツリー（初期状態: 1リーフ）
      const paneTree: PaneLeaf = {
        kind: 'leaf',
        id: paneId,
        sessionId: session.id,
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
      const created = await createWorkspaceSession(
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
      const { paneId: newPaneId } = created

      // ペインツリーを分割
      const newLeaf: PaneLeaf = {
        kind: 'leaf',
        id: newPaneId,
        sessionId: session.id,
        ratio: 0.5,
      }

      const splitTree = splitLeafInTree(workspace.paneTree, paneId, direction, newLeaf)
      if (!splitTree) {
        cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)
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
        cleanupSession(store, ptyManager, sshManager, worktreeService, session.id)
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

    const sessionId = targetLeaf.sessionId

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

// セッションクリーンアップ・ペインツリーヘルパーは外部モジュールから import

// セッション状態
export type SessionStatus = 'active' | 'paused' | 'terminated' | 'disconnected' | 'cleaning' | 'tombstone'

// セッション
export interface Session {
  id: string
  name: string
  repoPath: string
  worktreePath: string | null
  branch: string | null
  status: SessionStatus
  claudeSessionId: string | null
  isFavorite: boolean
  projectId: string | null
  sshHost: string | null
  isRemote: boolean
  workspaceId: string | null
  createdAt: number
  lastActiveAt: number
}

// セッション作成パラメータ
export interface CreateSessionParams {
  name: string
  repoPath: string
  baseBranch?: string
  useWorktree?: boolean
  sshHost?: string
  workspaceId?: string
}

// Worktree情報
export interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
}

// ========== cmux ペインツリー（バイナリツリー） ==========

/** スプリット方向 */
export type SplitDirection = 'horizontal' | 'vertical'

/** ペインツリーのリーフ（1ペイン = 1セッション） */
export interface PaneLeaf {
  kind: 'leaf'
  id: string
  /** このペインに紐づくセッションID */
  sessionId: string
  /** 親スプリット内での割合（0-1） */
  ratio: number
}

/** ペインツリーの分割ノード */
export interface PaneSplit {
  kind: 'split'
  id: string
  /** 親スプリット内での割合（0-1）。ネストされたスプリットのサイズ計算用 */
  ratio: number
  direction: SplitDirection
  children: [PaneNode, PaneNode]
}

/** ペインツリーのノード（リーフ or スプリット） */
export type PaneNode = PaneLeaf | PaneSplit

// ========== ワークスペース ==========

/** ワークスペース（cmux のワークスペース概念） */
export interface CmuxWorkspace {
  id: string
  name: string
  projectId: string | null
  /** ベースリポジトリパス（全ペインの起点） */
  repoPath: string
  /** SSHホスト名（リモートWSの場合） */
  sshHost: string | null
  paneTree: PaneNode
  activePaneId: string
  isPinned: boolean
  /** ランタイムのみ（非永続化） */
  notificationCount: number
  /** 最終通知時刻（リオーダー用） */
  lastNotifiedAt: number | null
  createdAt: number
  updatedAt: number
}

/** ワークスペース作成パラメータ */
export interface CreateCmuxWorkspaceParams {
  /** ワークスペース名（省略時はrepoPathの末尾がデフォルト） */
  name?: string
  /** リポジトリパス（必須） */
  repoPath: string
  projectId?: string
  useWorktree?: boolean
  baseBranch?: string
  sshHost?: string
}

/** ペイン分割リクエスト */
export interface SplitPaneRequest {
  paneId: string
  direction: SplitDirection
  /** WSのデフォルトと異なるSSHホストで分割する場合 */
  sshHost?: string | null
  /** WSのデフォルトと異なるリポパスで分割する場合 */
  repoPath?: string | null
}

/** ペイン分割レスポンス（サーバーが新セッション+worktreeを作成） */
export interface SplitPaneResponse {
  paneTree: PaneNode
  activePaneId: string
  newSession: Session
}

/** ペイン閉じリクエスト */
export interface ClosePaneRequest {
  paneId: string
}

/** ペイン閉じレスポンス */
export interface ClosePaneResponse {
  paneTree: PaneNode
  activePaneId: string
  /** 削除されたセッションID（ペインにターミナルサーフェスがあった場合） */
  deletedSessionId: string | null
}

/** ペイン通知情報 */
export interface PaneNotification {
  paneId: string
  surfaceId: string
  sessionId: string
  message: string
  timestamp: number
  read: boolean
}

/** アプリ全体のレイアウト状態 */
export interface AppLayoutState {
  workspaceIds: string[]
  activeWorkspaceId: string | null
  sidebarCollapsed: boolean
  savedAt: number
}

// ========== レガシーレイアウト / ボード ==========

/** 分割ビューのレイアウト種別 */
export type LayoutMode = '1x1' | '2x1' | '1x2' | '2x2' | '3x1'

/** ボード自動配置のモード */
export type AutoLayoutMode = 'grid' | 'flow' | 'tree'

/** 旧レイアウトAPIのパネル情報 */
export interface LayoutPanel {
  sessionId: string | null
  position: number
}

/** 旧レイアウトAPIの保存形式 */
export interface LayoutState {
  mode: LayoutMode
  panels: LayoutPanel[]
  activePanelIndex: number
  savedAt: number
}

/** ボード上のセッションノード位置 */
export interface BoardNodePosition {
  sessionId: string
  x: number
  y: number
  width: number
  height: number
}

/** ボード上の接続線 */
export interface BoardEdge {
  id: string
  source: string
  target: string
  label?: string
}

/** ボード上のファイルタイル位置 */
export interface FileTilePosition {
  id: string
  filePath: string
  language: string
  x: number
  y: number
  width: number
  height: number
}

/** ボードレイアウト保存形式 */
export interface BoardLayoutState {
  nodes: BoardNodePosition[]
  edges: BoardEdge[]
  fileTiles?: FileTilePosition[]
  viewport: { x: number; y: number; zoom: number }
  savedAt: number
}

/** 旧キャンバスワークスペース保存リクエスト */
export interface CreateWorkspaceParams {
  name: string
}

/** ボードキャンバスのフィルタ条件 */
export interface CanvasFilterCriteria {
  favoritesOnly: boolean
  status: SessionStatus | 'all'
  projectId: string | null
}

/** キャンバス表示判定 */
export function matchesCanvasFilter(
  session: Pick<Session, 'isFavorite' | 'status' | 'projectId'>,
  filter: CanvasFilterCriteria,
): boolean {
  if (filter.favoritesOnly && !session.isFavorite) {
    return false
  }

  if (filter.status !== 'all' && session.status !== filter.status) {
    return false
  }

  if (filter.projectId !== null && session.projectId !== filter.projectId) {
    return false
  }

  return true
}

// ========== プロジェクト ==========

// プロジェクト
export interface Project {
  id: string
  name: string
  color: string // hex color like '#3b82f6'
  repoPath: string
  sshPresetId?: string | null
  startupTemplateId?: string | null
  createdAt: number
}

// プロジェクト作成パラメータ
export interface CreateProjectParams {
  name: string
  color: string
  repoPath: string
}

// プロジェクトカラー定数
export const PROJECT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
] as const

// ========== SSH ==========

// SSHホスト情報
export interface SshHost {
  name: string
  hostname: string
  user: string
  port: number
  identityFile: string | null
  isConnected: boolean
}

// SSH接続ステータス
export type SshConnectionStatus = 'online' | 'offline' | 'reconnecting'

// SSHプリセット（プロジェクトに紐付くSSH接続設定）
export interface SshPreset {
  id: string
  name: string
  hostname: string
  user: string
  port: number
  identityFile: string | null
  defaultCwd: string
  startupCommand: string | null
  envVars: Record<string, string>
  createdAt: number
}

// SSHプリセット作成パラメータ
export interface CreateSshPresetParams {
  name: string
  hostname: string
  user: string
  port?: number
  identityFile?: string
  defaultCwd: string
  startupCommand?: string
  envVars?: Record<string, string>
}

// 起動テンプレート
export interface StartupTemplate {
  id: string
  name: string
  sshPresetId: string | null
  commands: string[]
  envVars: Record<string, string>
  createdAt: number
}

// 起動テンプレート作成パラメータ
export interface CreateStartupTemplateParams {
  name: string
  sshPresetId?: string
  commands: string[]
  envVars?: Record<string, string>
}

// ========== シェル統合 (OSC 133) ==========

/** シェルの実行状態 */
export type ShellExecutionState = 'idle' | 'executing'

/**
 * OSC 133マーカーから得られるシェル状態
 * ターミナルセッションごとに1つ
 */
export interface ShellState {
  /** シェルの実行状態 */
  executionState: ShellExecutionState
  /** 直前コマンドの終了コード（未実行時はnull） */
  lastExitCode: number | null
  /** 直前コマンドの終了時刻（通知判定用） */
  lastCommandFinishedAt: number | null
}

// ========== 通知 ==========

// Claude通知
export interface ClaudeNotification {
  id: string
  sessionId: string
  message: string
  timestamp: number
  read: boolean
}

// ========== ファイルツリー ==========

// ファイルツリーノード
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

// ========== tabコマンド連携 ==========

export interface TabHost {
  name: string
  type: 'local' | 'remote'
  projects: TabProject[]
}

export interface TabProject {
  name: string
  path: string
}

export interface TabListResponse {
  hosts: TabHost[]
}

export interface TabSyncResponse {
  created: number
  skipped: number
  projects: Project[]
  sessions: Session[]
}

// ========== フィードバック ==========

// フィードバックカテゴリ
export type FeedbackCategory = 'feature_request' | 'bug_report' | 'improvement'

// フィードバック優先度
export type FeedbackPriority = 'high' | 'medium' | 'low'

// フィードバック
export interface Feedback {
  id: string
  title: string
  detail: string
  category: FeedbackCategory
  priority: FeedbackPriority
  createdAt: number
}

// フィードバック作成パラメータ
export interface CreateFeedbackParams {
  title: string
  detail: string
  category: FeedbackCategory
  priority: FeedbackPriority
}

// フィードバックカテゴリラベル
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  feature_request: '機能要望',
  bug_report: 'バグ報告',
  improvement: '改善提案',
} as const

// フィードバック優先度ラベル
export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
} as const

// ========== 開発インスタンス / スロット管理 ==========

/** 開発インスタンスの状態 */
export type DevInstanceStatus = 'idle' | 'running' | 'error'

/** 開発インスタンス（pane 単位の開発環境） */
export interface DevInstance {
  id: string
  /** スロット番号（PANE_NUMBER に対応） */
  slotNumber: number
  /** サーバーポート */
  serverPort: number
  /** クライアントポート */
  clientPort: number
  /** Playwright ポート */
  playwrightPort: number
  status: DevInstanceStatus
  pid: number | null
  /** persistent develop worktree パス */
  worktreePath: string | null
  /** バインドされたセッションID */
  assignedSessionId: string | null
  createdAt: number
  lastActiveAt: number
}

/** スロット割り当て（UNIQUE 制約で排他制御） */
export interface SlotAssignment {
  slotNumber: number
  instanceId: string
  assignedAt: number
}

// ========== Playwright Runner ==========

/** Playwright テスト実行の状態 */
export type PlaywrightRunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error'

/** Playwright テスト実行結果 */
export interface PlaywrightRunResult {
  /** 実行 ID（instanceId と同一） */
  instanceId: string
  status: PlaywrightRunStatus
  /** 実行対象のテストパス */
  testPath: string | null
  /** プロセス PID */
  pid: number | null
  /** 開始時刻 */
  startedAt: number | null
  /** 終了時刻 */
  finishedAt: number | null
  /** exit code（完了時のみ） */
  exitCode: number | null
  /** テスト出力（stdout + stderr） */
  output: string
  /** Playwright ポート */
  port: number
}

// ========== bookmarks ==========

// bookmarks.toml のブックマーク情報
export interface TabBookmark {
  name: string
  directory: string
  host?: string
  shared?: boolean
}

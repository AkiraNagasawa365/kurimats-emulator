// セッション状態
export type SessionStatus = 'active' | 'paused' | 'terminated' | 'disconnected'

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

/** サーフェス種別（ペイン内タブの中身） */
export type SurfaceType = 'terminal' | 'browser' | 'editor' | 'markdown'

/** サーフェス（ペイン内の1タブ） */
export interface Surface {
  id: string
  type: SurfaceType
  /** terminal: sessionId, browser: url, editor: filePath, markdown: filePath */
  target: string
  label: string
}

/** ペインツリーのリーフ（実際のコンテンツを持つ） */
export interface PaneLeaf {
  kind: 'leaf'
  id: string
  surfaces: Surface[]
  activeSurfaceIndex: number
  /** 親スプリット内での割合（0-1） */
  ratio: number
}

/** ペインツリーの分割ノード */
export interface PaneSplit {
  kind: 'split'
  id: string
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
  name: string
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
}

/** ペイン分割レスポンス（サーバーが新セッション+worktreeを作成） */
export interface SplitPaneResponse {
  paneTree: PaneNode
  activePaneId: string
  newSession: Session
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

// ========== bookmarks ==========

// bookmarks.toml のブックマーク情報
export interface TabBookmark {
  name: string
  directory: string
  host?: string
  shared?: boolean
}

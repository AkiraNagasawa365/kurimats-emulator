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
}

// Worktree情報
export interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
}

// ボードカード種別
export type BoardCardType = 'screenshot' | 'text_output' | 'file_change' | 'error' | 'custom'

// ボードカード
export interface BoardCard {
  id: string
  sessionId: string
  type: BoardCardType
  title: string
  content: Record<string, unknown>
  position: { x: number; y: number }
  dimensions: { width: number; height: number }
  createdAt: number
}

// 自動レイアウトモード
export type AutoLayoutMode = 'grid' | 'flow' | 'tree'

// パネルレイアウト
export type LayoutMode = '1x1' | '2x1' | '1x2' | '2x2' | '3x1'

export interface PanelLayout {
  mode: LayoutMode
  panels: Array<{
    sessionId: string | null
    position: number
  }>
}

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

// レイアウト永続化
export interface LayoutState {
  mode: LayoutMode
  panels: Array<{ sessionId: string | null; position: number }>
  activePanelIndex: number
  savedAt: number
}

// プロジェクトカラー定数
export const PROJECT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
] as const

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

// Claude通知
export interface ClaudeNotification {
  id: string
  sessionId: string
  message: string
  timestamp: number
  read: boolean
}

// ファイルツリーノード
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

// ボードタイルの種別
export type BoardTileType = 'session' | 'file'

// ボードノード位置情報（React Flow用）
export interface BoardNodePosition {
  sessionId: string
  x: number
  y: number
  width: number
  height: number
}

// ファイルタイル（キャンバス上にMonaco Editorでファイルを表示）
export interface FileTilePosition {
  id: string
  filePath: string
  language: string
  x: number
  y: number
  width: number
  height: number
}

// ボードエッジ（ノード間の接続線）
export interface BoardEdge {
  id: string
  source: string // ソースノードのsessionId
  target: string // ターゲットノードのsessionId
  label?: string // オプションのラベル
}

// ボードレイアウト永続化
export interface BoardLayoutState {
  nodes: BoardNodePosition[]
  fileTiles?: FileTilePosition[]
  edges: BoardEdge[]
  viewport: { x: number; y: number; zoom: number }
  savedAt: number
}

// tabコマンド連携
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

// bookmarks.toml のブックマーク情報
export interface TabBookmark {
  name: string
  directory: string
  host?: string // リモートホスト名（ローカルの場合はundefined）
  shared?: boolean
}

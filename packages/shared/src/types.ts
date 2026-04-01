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
  createdAt: number
  lastActiveAt: number
}

// セッション作成パラメータ
export interface CreateSessionParams {
  name: string
  repoPath: string
  baseBranch?: string
  useWorktree?: boolean
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

// ファイルツリーノード
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

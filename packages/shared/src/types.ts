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

// パネルレイアウト
export type LayoutMode = '1x1' | '2x1' | '1x2' | '2x2' | '3x1'

export interface PanelLayout {
  mode: LayoutMode
  panels: Array<{
    sessionId: string | null
    position: number
  }>
}

// ファイルツリーノード
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

// ターミナルWebSocketメッセージ

// クライアント → サーバー
export type ClientTerminalMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }

// サーバー → クライアント
export type ServerTerminalMessage =
  | { type: 'output'; data: string }
  | { type: 'exit'; code: number }
  | { type: 'connected'; sessionId: string }
  | { type: 'error'; message: string }

// ボードWebSocketメッセージ
export type BoardMessage =
  | { type: 'card_added'; card: import('./types.js').BoardCard }
  | { type: 'card_updated'; card: import('./types.js').BoardCard }
  | { type: 'card_removed'; cardId: string }

// プロジェクトWebSocketメッセージ
export type ProjectMessage =
  | { type: 'project_created'; project: import('./types.js').Project }
  | { type: 'project_updated'; project: import('./types.js').Project }
  | { type: 'project_deleted'; projectId: string }

// ファイルウォッチWebSocketメッセージ
export type FileWatchMessage =
  | { type: 'file_changed'; path: string; event: 'add' | 'change' | 'unlink' }
  | { type: 'dir_changed'; path: string; event: 'addDir' | 'unlinkDir' }

// 通知WebSocketメッセージ（サーバー → クライアント）
export type NotificationMessage =
  | { type: 'claude_notification'; sessionId: string; message: string; timestamp: number }
  | { type: 'connection_status'; host: string; status: 'online' | 'offline' | 'reconnecting' }

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

// 通知WebSocketメッセージ（サーバー → クライアント）
export type NotificationMessage =
  | { type: 'claude_notification'; sessionId: string; message: string; timestamp: number }
  | { type: 'connection_status'; host: string; status: 'online' | 'offline' | 'reconnecting' }
  | { type: 'attention_ring'; sessionId: string; active: boolean }
  | { type: 'port_detected'; sessionId: string; port: number; url: string }
  | { type: 'playwright_progress'; instanceId: string; status: import('./types').PlaywrightRunStatus; line?: string; timestamp: number }
  | { type: 'resource_update'; snapshot: import('./types').ResourceSnapshot }

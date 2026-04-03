import { memo, useEffect, useState, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Session } from '@kurimats/shared'
import { TerminalComponent } from '../terminal/Terminal'
import { TerminalHeader } from '../terminal/TerminalHeader'
import { sessionsApi } from '../../lib/api'

export interface SessionNodeData {
  session: Session
  isActive: boolean
  projectColor: string | null
  onClose: () => void
  onFocus: () => void
  onToggleFavorite: () => void
  onReconnect?: () => void
  [key: string]: unknown
}

/** プレビューの最大行数 */
const PREVIEW_LINES = 5
/** プレビュー更新間隔（ミリ秒） */
const PREVIEW_INTERVAL = 3000

/**
 * React Flowカスタムノード: セッションターミナルカード
 * ターミナルヘッダー + お気に入り★ + プレビュー + xterm.jsターミナルを内包
 */
function SessionNodeComponent({ data }: NodeProps) {
  const { session, isActive, projectColor, onClose, onFocus, onToggleFavorite, onReconnect } = data as unknown as SessionNodeData
  const isDisconnected = session.status === 'disconnected'
  const [previewLines, setPreviewLines] = useState<string[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  // プレビュー取得
  const fetchPreview = useCallback(async () => {
    try {
      const result = await sessionsApi.getPreview(session.id, PREVIEW_LINES)
      setPreviewLines(result.lines)
    } catch {
      // プレビュー取得失敗は静かに無視
    }
  }, [session.id])

  // 定期的にプレビューを更新
  useEffect(() => {
    fetchPreview()
    intervalRef.current = setInterval(fetchPreview, PREVIEW_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchPreview])

  return (
    <div
      className={`flex flex-col rounded-lg overflow-hidden shadow-lg border-2 transition-shadow ${
        isActive ? 'border-accent shadow-accent/20' : 'border-border shadow-md'
      }`}
      style={{
        width: '100%',
        height: '100%',
        // プロジェクトカラーの枠線
        ...(projectColor ? { borderColor: projectColor, borderWidth: '2px' } : {}),
      }}
      onClick={onFocus}
    >
      {/* ドラッグハンドル兼ヘッダー */}
      <div className="drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center">
          {/* お気に入り★ボタン */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
            className={`flex-shrink-0 px-1.5 py-1.5 text-sm transition-colors hover:scale-110 ${
              session.isFavorite
                ? 'text-yellow-400 hover:text-yellow-300'
                : 'text-gray-400 hover:text-yellow-400'
            }`}
            title={session.isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            {session.isFavorite ? '★' : '☆'}
          </button>
          <div className="flex-1 min-w-0">
            <TerminalHeader
              session={session}
              isActive={isActive}
              onClose={onClose}
            />
          </div>
        </div>
        {/* プロジェクトカラーバー */}
        {projectColor && (
          <div
            className="h-0.5 w-full"
            style={{ backgroundColor: projectColor }}
          />
        )}
      </div>

      {/* ターミナルプレビュー */}
      {previewLines.length > 0 && (
        <div className="bg-[#252526] border-b border-[#3c3c3c] px-2 py-1 max-h-24 overflow-hidden">
          <div className="text-[10px] text-gray-500 mb-0.5">プレビュー</div>
          <pre className="text-[11px] text-gray-300 font-mono leading-tight whitespace-pre-wrap break-all">
            {previewLines.join('\n')}
          </pre>
        </div>
      )}

      {/* ターミナル本体 or disconnectedオーバーレイ */}
      <div className="flex-1 min-h-0 bg-[#1e1e1e] relative">
        {isDisconnected ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-gray-400 gap-3 nopan nodrag">
            <div className="text-sm">切断済み</div>
            {onReconnect && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onReconnect() }}
                className="px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-500 text-white rounded transition-colors cursor-pointer"
              >
                再接続
              </button>
            )}
          </div>
        ) : (
          <TerminalComponent
            sessionId={session.id}
            isActive={isActive}
            onFocus={onFocus}
          />
        )}
      </div>

      {/* React Flow接続ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-accent !border-2 !border-white hover:!bg-blue-400 !transition-colors"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-accent !border-2 !border-white hover:!bg-blue-400 !transition-colors"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !bg-accent !border-2 !border-white hover:!bg-blue-400 !transition-colors"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !bg-accent !border-2 !border-white hover:!bg-blue-400 !transition-colors"
      />
    </div>
  )
}

export const SessionNode = memo(SessionNodeComponent)

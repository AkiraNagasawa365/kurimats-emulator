import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Session } from '@kurimats/shared'
import { TerminalComponent } from '../terminal/Terminal'
import { TerminalHeader } from '../terminal/TerminalHeader'
import { useOverlayStore } from '../../stores/overlay-store'

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

/**
 * React Flowカスタムノード: セッションターミナルカード
 * ターミナルヘッダー + お気に入り★ + xterm.jsターミナルを内包
 */
function SessionNodeComponent({ data }: NodeProps) {
  const { session, isActive, projectColor, onClose, onFocus, onToggleFavorite, onReconnect } = data as unknown as SessionNodeData
  const isDisconnected = session.status === 'disconnected'
  const { openOverlay } = useOverlayStore()

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
          {/* ファイルツリー📁ボタン */}
          <button
            onClick={(e) => { e.stopPropagation(); openOverlay('file-tree', { sessionId: session.id }) }}
            className="flex-shrink-0 px-1.5 py-1.5 text-sm text-gray-400 hover:text-blue-400 transition-colors hover:scale-110"
            title="ファイルツリーを開く"
          >
            📁
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

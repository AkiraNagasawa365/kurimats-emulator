import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Session } from '@kurimats/shared'
import { TerminalComponent } from '../terminal/Terminal'
import { TerminalHeader } from '../terminal/TerminalHeader'

export interface SessionNodeData {
  session: Session
  isActive: boolean
  projectColor: string | null
  onClose: () => void
  onFocus: () => void
  [key: string]: unknown
}

/**
 * React Flowカスタムノード: セッションターミナルカード
 * ターミナルヘッダー + xterm.jsターミナルを内包
 */
function SessionNodeComponent({ data }: NodeProps) {
  const { session, isActive, projectColor, onClose, onFocus } = data as unknown as SessionNodeData

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
        <TerminalHeader
          session={session}
          isActive={isActive}
          onClose={onClose}
        />
        {/* プロジェクトカラーバー */}
        {projectColor && (
          <div
            className="h-0.5 w-full"
            style={{ backgroundColor: projectColor }}
          />
        )}
      </div>

      {/* ターミナル本体 */}
      <div className="flex-1 min-h-0 bg-[#1e1e1e]">
        <TerminalComponent
          sessionId={session.id}
          isActive={isActive}
          onFocus={onFocus}
        />
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

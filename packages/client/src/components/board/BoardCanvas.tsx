import { useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  type Node,
  type NodeChange,
  type Viewport,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useLayoutStore } from '../../stores/layout-store'
import { useSessionStore } from '../../stores/session-store'
import { SessionNode, type SessionNodeData } from './SessionNode'

// カスタムノードタイプの登録
const nodeTypes = {
  session: SessionNode,
}

/**
 * Miroライクなボードキャンバス
 * React Flowを使ってセッションノードを自由配置
 */
export function BoardCanvas() {
  const {
    boardNodes,
    activeSessionId,
    viewport,
    setActiveSession,
    updateNodePosition,
    removeBoardNode,
    setViewport,
    setBoardNodes,
  } = useLayoutStore()

  const { sessions, projects, deleteSession } = useSessionStore()

  // セッションからプロジェクトカラーを取得
  const getProjectColor = useCallback((projectId: string | null) => {
    if (!projectId) return null
    return projects.find(p => p.id === projectId)?.color ?? null
  }, [projects])

  // ボードノードをReact Flowノードに変換
  const flowNodes: Node[] = useMemo(() => {
    const result: Node[] = []
    for (const node of boardNodes) {
      const session = sessions.find(s => s.id === node.sessionId)
      if (!session) continue

      result.push({
        id: node.sessionId,
        type: 'session',
        position: { x: node.x, y: node.y },
        data: {
          session,
          isActive: node.sessionId === activeSessionId,
          projectColor: getProjectColor(session.projectId),
          onClose: () => {
            deleteSession(session.id)
            removeBoardNode(session.id)
          },
          onFocus: () => setActiveSession(session.id),
        } as SessionNodeData,
        style: {
          width: node.width,
          height: node.height,
        },
        dragHandle: '.drag-handle',
      })
    }
    return result
  }, [boardNodes, sessions, activeSessionId, projects, getProjectColor, deleteSession, removeBoardNode, setActiveSession])

  const [nodes, setNodes] = useNodesState(flowNodes)

  // flowNodesが変更されたらnodesを更新
  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  // ノードの変更を処理
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds))

    // ドラッグ終了時に位置を永続化
    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false && change.position) {
        updateNodePosition(change.id, change.position.x, change.position.y)
      }
    }
  }, [setNodes, updateNodePosition])

  // リサイズ時のサイズ永続化
  const onNodesChangeWithResize = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)

    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        // ボードノードのサイズを更新
        const updatedNodes = [...boardNodes]
        const nodeIndex = updatedNodes.findIndex(n => n.sessionId === change.id)
        if (nodeIndex >= 0 && change.dimensions.width && change.dimensions.height) {
          updatedNodes[nodeIndex] = {
            ...updatedNodes[nodeIndex],
            width: change.dimensions.width,
            height: change.dimensions.height,
          }
          setBoardNodes(updatedNodes)
        }
      }
    }
  }, [onNodesChange, boardNodes, setBoardNodes])

  // ビューポート変更を処理
  const onMoveEnd = useCallback((_event: unknown, vp: Viewport) => {
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
  }, [setViewport])

  // ペインクリック時にアクティブセッション解除
  const onPaneClick = useCallback(() => {
    setActiveSession(null)
  }, [setActiveSession])

  // プロジェクトグループの背景色マップ（ミニマップ用）
  const nodeColor = useCallback((node: Node) => {
    const data = node.data as SessionNodeData
    return data.projectColor || '#6b7280'
  }, [])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChangeWithResize}
        onMoveEnd={onMoveEnd}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultViewport={viewport}
        minZoom={0.1}
        maxZoom={2}
        fitView={boardNodes.length > 0 && viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1}
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
        className="bg-surface-0"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#e5e7eb"
        />
        <MiniMap
          nodeColor={nodeColor}
          nodeStrokeWidth={2}
          pannable
          zoomable
          className="!bg-white !border-border"
        />
      </ReactFlow>

      {/* ボードが空の場合のプレースホルダー */}
      {boardNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-text-muted">
            <p className="text-lg font-medium">ボードキャンバス</p>
            <p className="text-sm mt-2">サイドバーからセッションを作成してください</p>
          </div>
        </div>
      )}
    </div>
  )
}

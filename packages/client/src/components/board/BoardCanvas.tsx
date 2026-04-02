import { useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useLayoutStore } from '../../stores/layout-store'
import { useSessionStore } from '../../stores/session-store'
import { SessionNode, type SessionNodeData } from './SessionNode'
import { ProjectGroupNode, type ProjectGroupNodeData } from './ProjectGroupNode'
import type { BoardEdge } from '@kurimats/shared'

// カスタムノードタイプの登録
const nodeTypes = {
  session: SessionNode,
  projectGroup: ProjectGroupNode,
}

// プロジェクトグループの枠のパディング
const GROUP_PADDING = 40

/**
 * Miroライクなボードキャンバス
 * React Flowを使ってセッションノードを自由配置
 */
export function BoardCanvas() {
  return (
    <ReactFlowProvider>
      <BoardCanvasInner />
    </ReactFlowProvider>
  )
}

function BoardCanvasInner() {
  const { fitView, setCenter } = useReactFlow()
  const prevActiveSessionRef = useRef<string | null>(null)
  const initialFitDone = useRef(false)
  const {
    boardNodes,
    boardEdges,
    activeSessionId,
    viewport,
    setActiveSession,
    updateNodePosition,
    removeBoardNode,
    setViewport,
    setBoardNodes,
    addEdge: addBoardEdge,
    removeEdge: removeBoardEdge,
    setBoardEdges,
  } = useLayoutStore()

  const { sessions, projects, deleteSession, toggleFavorite } = useSessionStore()

  // セッションからプロジェクトカラーを取得
  const getProjectColor = useCallback((projectId: string | null) => {
    if (!projectId) return null
    return projects.find(p => p.id === projectId)?.color ?? null
  }, [projects])

  // ボードノードをReact Flowノードに変換
  const flowNodes: Node[] = useMemo(() => {
    const result: Node[] = []

    // プロジェクトごとにノードをグループ化してバウンディングボックスを計算
    const projectGroups = new Map<string, { color: string; name: string; minX: number; minY: number; maxX: number; maxY: number }>()

    for (const node of boardNodes) {
      const session = sessions.find(s => s.id === node.sessionId)
      if (!session || !session.projectId) continue

      const project = projects.find(p => p.id === session.projectId)
      if (!project) continue

      const group = projectGroups.get(session.projectId)
      if (group) {
        group.minX = Math.min(group.minX, node.x)
        group.minY = Math.min(group.minY, node.y)
        group.maxX = Math.max(group.maxX, node.x + node.width)
        group.maxY = Math.max(group.maxY, node.y + node.height)
      } else {
        projectGroups.set(session.projectId, {
          color: project.color,
          name: project.name,
          minX: node.x,
          minY: node.y,
          maxX: node.x + node.width,
          maxY: node.y + node.height,
        })
      }
    }

    // プロジェクトグループ枠ノードを追加（セッションノードの後ろに配置）
    for (const [projectId, group] of projectGroups) {
      result.push({
        id: `group-${projectId}`,
        type: 'projectGroup',
        position: {
          x: group.minX - GROUP_PADDING,
          y: group.minY - GROUP_PADDING,
        },
        data: {
          label: group.name,
          color: group.color,
        } as ProjectGroupNodeData,
        style: {
          width: group.maxX - group.minX + GROUP_PADDING * 2,
          height: group.maxY - group.minY + GROUP_PADDING * 2,
        },
        selectable: false,
        draggable: false,
        zIndex: -1,
      })
    }

    // セッションノードを追加
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
          onToggleFavorite: () => toggleFavorite(session.id),
        } as SessionNodeData,
        style: {
          width: node.width,
          height: node.height,
        },
        dragHandle: '.drag-handle',
        zIndex: 1,
      })
    }
    return result
  }, [boardNodes, sessions, activeSessionId, projects, getProjectColor, deleteSession, removeBoardNode, setActiveSession, toggleFavorite])

  // ボードエッジをReact Flowエッジに変換
  const flowEdges: Edge[] = useMemo(() => {
    return boardEdges.map((edge: BoardEdge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label || '',
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#6b7280', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6b7280',
      },
    }))
  }, [boardEdges])

  const [nodes, setNodes] = useNodesState(flowNodes)
  const [edges, setEdges] = useEdgesState(flowEdges)

  // flowNodesが変更されたらnodesを更新
  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  // flowEdgesが変更されたらedgesを更新
  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  // 初回ロード時に全ノードが見えるようにフィット
  useEffect(() => {
    if (!initialFitDone.current && boardNodes.length > 0) {
      initialFitDone.current = true
      // React Flowの初期化を待つ
      setTimeout(() => {
        fitView({ padding: 0.3, duration: 300 })
      }, 100)
    }
  }, [boardNodes.length, fitView])

  // activeSessionIdが変更されたらそのノードにフォーカス
  useEffect(() => {
    if (activeSessionId && activeSessionId !== prevActiveSessionRef.current) {
      const node = boardNodes.find(n => n.sessionId === activeSessionId)
      if (node) {
        setCenter(
          node.x + node.width / 2,
          node.y + node.height / 2,
          { zoom: 0.8, duration: 300 },
        )
      }
    }
    prevActiveSessionRef.current = activeSessionId
  }, [activeSessionId, boardNodes, setCenter])

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

  // エッジの変更を処理（削除など）
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds))

    // 削除された場合はストアに反映
    for (const change of changes) {
      if (change.type === 'remove') {
        removeBoardEdge(change.id)
      }
    }
  }, [setEdges, removeBoardEdge])

  // 新しい接続（エッジ追加）
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    // 自己接続を防ぐ
    if (connection.source === connection.target) return

    const newEdge: BoardEdge = {
      id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source,
      target: connection.target,
    }
    addBoardEdge(newEdge)

    // React Flowにも反映
    setEdges(eds => rfAddEdge({
      ...connection,
      id: newEdge.id,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#6b7280', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6b7280',
      },
    }, eds))
  }, [addBoardEdge, setEdges])

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

  // ノードドラッグ開始時、他のノードの選択を解除（Shift未押下時）
  const onNodeDragStart = useCallback((_event: unknown, node: Node) => {
    setNodes(nds => nds.map(n => ({
      ...n,
      selected: n.id === node.id,
    })))
  }, [setNodes])

  // ペインクリック時にアクティブセッション解除
  const onPaneClick = useCallback(() => {
    setActiveSession(null)
  }, [setActiveSession])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeWithResize}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMoveEnd={onMoveEnd}
        onNodeDragStart={onNodeDragStart}
        onPaneClick={onPaneClick}
        multiSelectionKeyCode="Shift"
        nodeTypes={nodeTypes}
        defaultViewport={viewport}
        minZoom={0.1}
        maxZoom={2}
        fitView={false}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        className="bg-surface-0"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#e5e7eb"
        />
        {/* ミニマップは非表示（#48） */}
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

import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
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
import type { BoardEdge, Session } from '@kurimats/shared'
import { NodeContextMenu, CanvasContextMenu } from './ContextMenu'

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
  const {
    boardNodes,
    boardEdges,
    activeSessionId,
    viewport,
    setActiveSession,
    updateNodePosition,
    removeBoardNode,
    updateNodeSize,
    setViewport,
    setBoardNodes,
    addEdge: addBoardEdge,
    removeEdge: removeBoardEdge,
    setBoardEdges,
  } = useLayoutStore()

  const { sessions, projects, deleteSession, toggleFavorite, reconnectSession, assignProject, renameSession } = useSessionStore()

  // コンテキストメニュー状態
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; session: Session } | null>(null)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null)

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
          projectId,
        } as ProjectGroupNodeData,
        style: {
          width: group.maxX - group.minX + GROUP_PADDING * 2,
          height: group.maxY - group.minY + GROUP_PADDING * 2,
        },
        selectable: false,
        draggable: true,
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
          onReconnect: session.status === 'disconnected' ? () => {
            reconnectSession(session.id).catch(e => console.error('再接続エラー:', e))
          } : undefined,
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

  // React Flow初期化完了時に全ノードをフィット
  const onInit = useCallback(() => {
    if (boardNodes.length > 0) {
      fitView({ padding: 0.3, duration: 300 })
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

  // ノードの変更を処理（単一選択を強制）
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // ドラッグ中は、ドラッグ対象ノード以外の位置変更を除外
    const filteredChanges = draggingNodeRef.current
      ? changes.filter(c => {
          if (c.type === 'position' && 'id' in c && c.id !== draggingNodeRef.current) {
            return false
          }
          return true
        })
      : changes

    // 選択変更を検出: 1つのノードが選択されたら他を非選択にする
    const selectChanges = filteredChanges.filter((c): c is NodeChange & { type: 'select'; id: string; selected: boolean } => c.type === 'select' && 'selected' in c && (c as { selected?: boolean }).selected === true)
    if (selectChanges.length === 1) {
      const selectedId = selectChanges[0].id
      setNodes(nds => {
        const applied = applyNodeChanges(filteredChanges, nds)
        // 選択されたノード以外を非選択に
        return applied.map(n => ({
          ...n,
          selected: n.id === selectedId,
        }))
      })
    } else {
      setNodes(nds => applyNodeChanges(filteredChanges, nds))
    }

    // ドラッグ終了時に位置を永続化
    for (const change of filteredChanges) {
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
      if (change.type === 'dimensions' && change.dimensions && change.dimensions.width && change.dimensions.height) {
        // リサイズによるサイズ変更を永続化（resizing完了時のみ）
        if ('resizing' in change && change.resizing === false) {
          updateNodeSize(change.id, change.dimensions.width, change.dimensions.height)
        }
      }
    }
  }, [onNodesChange, updateNodeSize])

  // ビューポート変更を処理
  const onMoveEnd = useCallback((_event: unknown, vp: Viewport) => {
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
  }, [setViewport])

  // ドラッグ中のノードIDを記録
  const draggingNodeRef = useRef<string | null>(null)
  // グループドラッグの開始位置を記録
  const groupDragStartRef = useRef<{ x: number; y: number } | null>(null)

  // ノードドラッグ開始時、他のノードの選択を解除（Shift未押下時）
  const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    draggingNodeRef.current = node.id
    // プロジェクトグループのドラッグ開始位置を記録
    if (node.id.startsWith('group-')) {
      groupDragStartRef.current = { x: node.position.x, y: node.position.y }
    }
    // Shiftキーが押されていなければ単一選択を強制
    if (!(_event as React.MouseEvent).shiftKey) {
      setNodes(nds => nds.map(n => ({
        ...n,
        selected: n.id === node.id,
      })))
    }
  }, [setNodes])

  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    // プロジェクトグループのドラッグ完了 → 所属セッションノードを同じ量だけ移動
    if (node.id.startsWith('group-') && groupDragStartRef.current) {
      const dx = node.position.x - groupDragStartRef.current.x
      const dy = node.position.y - groupDragStartRef.current.y
      if (dx !== 0 || dy !== 0) {
        const projectId = node.id.replace('group-', '')
        // 所属セッションの位置を更新
        for (const bn of boardNodes) {
          const session = sessions.find(s => s.id === bn.sessionId)
          if (session?.projectId === projectId) {
            updateNodePosition(bn.sessionId, bn.x + dx, bn.y + dy)
          }
        }
      }
      groupDragStartRef.current = null
    }
    draggingNodeRef.current = null
  }, [boardNodes, sessions, updateNodePosition])

  // ペインクリック時にアクティブセッション解除
  const onPaneClick = useCallback(() => {
    setActiveSession(null)
    setNodeContextMenu(null)
    setCanvasContextMenu(null)
  }, [setActiveSession])

  // ノード右クリック
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    // プロジェクトグループは対象外
    if (node.id.startsWith('group-')) return
    const session = sessions.find(s => s.id === node.id)
    if (!session) return
    setCanvasContextMenu(null)
    setNodeContextMenu({ x: event.clientX, y: event.clientY, session })
  }, [sessions])

  // キャンバス右クリック
  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    setNodeContextMenu(null)
    setCanvasContextMenu({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY })
  }, [])

  // 自動整列
  const handleAutoLayout = useCallback(() => {
    if (boardNodes.length === 0) return
    const nodeCount = boardNodes.length
    const cols = Math.ceil(Math.sqrt(nodeCount))
    const gap = 40
    const nodeW = 520
    const nodeH = 620
    const newNodes = boardNodes.map((n, i) => ({
      ...n,
      x: (i % cols) * (nodeW + gap),
      y: Math.floor(i / cols) * (nodeH + gap),
    }))
    setBoardNodes(newNodes)
  }, [boardNodes, setBoardNodes])

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
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onInit={onInit}
        multiSelectionKeyCode="Shift"
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={2}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        className="bg-surface-0"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="#c0c4cc"
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

      {/* ノード右クリックコンテキストメニュー */}
      {nodeContextMenu && (
        <NodeContextMenu
          position={{ x: nodeContextMenu.x, y: nodeContextMenu.y }}
          session={nodeContextMenu.session}
          projects={projects}
          onClose={() => setNodeContextMenu(null)}
          onDelete={() => {
            deleteSession(nodeContextMenu.session.id)
            removeBoardNode(nodeContextMenu.session.id)
          }}
          onToggleFavorite={() => toggleFavorite(nodeContextMenu.session.id)}
          onAssignProject={(projectId) => assignProject(nodeContextMenu.session.id, projectId)}
          onRename={(name) => renameSession(nodeContextMenu.session.id, name)}
        />
      )}

      {/* キャンバス右クリックコンテキストメニュー */}
      {canvasContextMenu && (
        <CanvasContextMenu
          position={{ x: canvasContextMenu.x, y: canvasContextMenu.y }}
          onClose={() => setCanvasContextMenu(null)}
          onCreateSession={() => {
            // サイドバーの作成フォームにフォーカスさせるイベントを発火
            window.dispatchEvent(new CustomEvent('focus-create-session'))
          }}
          onAutoLayout={handleAutoLayout}
        />
      )}
    </div>
  )
}

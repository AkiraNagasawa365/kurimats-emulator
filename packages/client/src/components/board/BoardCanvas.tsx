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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = {
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

    // プロジェクトグループ枠ノードを追加（2セッション以上の場合のみ）
    for (const [projectId, group] of projectGroups) {
      // 同プロジェクトのセッション数を数える
      const memberCount = boardNodes.filter(n => {
        const s = sessions.find(ss => ss.id === n.sessionId)
        return s?.projectId === projectId
      }).length
      if (memberCount < 2) continue
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
        selected: node.sessionId === activeSessionId,
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
      style: { stroke: '#2dd4bf', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#2dd4bf',
      },
    }))
  }, [boardEdges])

  const [nodes, setNodes] = useNodesState(flowNodes)
  const [edges, setEdges] = useEdgesState(flowEdges)

  // リサイズ中フラグ（useEffectのsync抑制用）
  const isResizingRef = useRef(false)

  // flowNodesが変更されたらnodesを更新（リサイズ中は抑制）
  useEffect(() => {
    if (!isResizingRef.current) {
      setNodes(flowNodes)
    }
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
      style: { stroke: '#2dd4bf', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#2dd4bf',
      },
    }, eds))
  }, [addBoardEdge, setEdges])

  // リサイズ時のサイズ永続化
  const onNodesChangeWithResize = useCallback((changes: NodeChange[]) => {
    // リサイズ中かどうかを検出
    for (const change of changes) {
      if (change.type === 'dimensions' && 'resizing' in change) {
        if (change.resizing) {
          isResizingRef.current = true
        } else {
          isResizingRef.current = false
          // リサイズ完了時にサイズを永続化
          if (change.dimensions?.width && change.dimensions?.height) {
            updateNodeSize(change.id, change.dimensions.width, change.dimensions.height)
          }
        }
      }
    }

    onNodesChange(changes)
  }, [onNodesChange, updateNodeSize])

  // ビューポート変更を処理（ズームインジケーター付き）
  const onMoveEnd = useCallback((_event: unknown, vp: Viewport) => {
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
    // ズームインジケーター表示
    setZoomIndicator(Math.round(vp.zoom * 100))
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
    zoomTimerRef.current = setTimeout(() => setZoomIndicator(null), 1500)
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

  // ズームインジケーター
  const [zoomIndicator, setZoomIndicator] = useState<number | null>(null)
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ペインクリック時にアクティブセッション解除
  const onPaneClick = useCallback(() => {
    setActiveSession(null)
    setNodeContextMenu(null)
    setCanvasContextMenu(null)
  }, [setActiveSession])

  // ダブルクリック→新規セッション作成フォーム表示（Collaboratorスタイル）
  const onPaneDoubleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent('focus-create-session'))
  }, [])

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

  // 自動整列（プロジェクト別にグループ化して配置）
  const handleAutoLayout = useCallback(() => {
    if (boardNodes.length === 0) return
    const gap = 40
    const groupGap = 80
    const nodeW = 520
    const nodeH = 620

    // プロジェクト別にグループ化
    const groups = new Map<string, string[]>() // projectId → sessionId[]
    const unassigned: string[] = []
    for (const n of boardNodes) {
      const session = sessions.find(s => s.id === n.sessionId)
      const pid = session?.projectId
      if (pid) {
        const list = groups.get(pid) || []
        list.push(n.sessionId)
        groups.set(pid, list)
      } else {
        unassigned.push(n.sessionId)
      }
    }

    const posMap = new Map<string, { x: number; y: number }>()
    let currentY = 0

    // プロジェクト別に横に並べる
    for (const [, memberIds] of groups) {
      for (let i = 0; i < memberIds.length; i++) {
        posMap.set(memberIds[i], {
          x: i * (nodeW + gap),
          y: currentY,
        })
      }
      currentY += nodeH + groupGap
    }
    // 未割り当て
    for (let i = 0; i < unassigned.length; i++) {
      const cols = Math.ceil(Math.sqrt(unassigned.length))
      posMap.set(unassigned[i], {
        x: (i % cols) * (nodeW + gap),
        y: currentY + Math.floor(i / cols) * (nodeH + gap),
      })
    }

    const newNodes = boardNodes.map(n => {
      const pos = posMap.get(n.sessionId)
      return pos ? { ...n, x: pos.x, y: pos.y } : n
    })
    setBoardNodes(newNodes)
  }, [boardNodes, sessions, setBoardNodes])

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
        onDoubleClick={onPaneDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onInit={onInit}
        multiSelectionKeyCode="Shift"
        nodeTypes={nodeTypes}
        minZoom={0.33}
        maxZoom={1}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        className="bg-surface-0 [&_.react-flow__pane]:bg-surface-0"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="#1e2d3d"
        />
        {/* ミニマップは非表示（#48） */}
      </ReactFlow>

      {/* ボードが空の場合のプレースホルダー */}
      {boardNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-text-muted space-y-3">
            <p className="text-2xl font-bold text-text-secondary">Kurimats</p>
            <p className="text-sm">ダブルクリックでターミナルを作成</p>
            <p className="text-xs text-text-muted">または右クリックでメニューを開く</p>
          </div>
        </div>
      )}

      {/* ズームインジケーター */}
      {zoomIndicator !== null && (
        <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-surface-1/90 border border-border rounded-lg text-xs text-text-secondary font-mono animate-fade-in pointer-events-none z-10">
          {zoomIndicator}%
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

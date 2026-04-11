import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge as reactFlowAddEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { BoardEdge, Session } from '@kurimats/shared'
import { useLayoutStore } from '../../stores/layout-store'
import { useSessionStore } from '../../stores/session-store'
import { CanvasContextMenu, NodeContextMenu } from './ContextMenu'
import { CanvasToolbar } from './CanvasToolbar'
import {
  autoLayoutBoardNodes,
  boardNodeTypes,
  buildFlowEdges,
  buildFlowNodes,
  type CanvasFilter,
} from './board-canvas-elements'

export function BoardCanvas() {
  return (
    <ReactFlowProvider>
      <BoardCanvasInner />
    </ReactFlowProvider>
  )
}

function BoardCanvasInner() {
  const { fitView, setCenter, zoomIn, zoomOut } = useReactFlow()
  const previousActiveSessionIdRef = useRef<string | null>(null)
  const zoomIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingNodeIdRef = useRef<string | null>(null)
  const groupDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const isResizingRef = useRef(false)

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
    addEdge,
    removeEdge,
    fileTiles,
    removeFileTile,
    updateFileTilePosition,
    updateFileTileSize,
  } = useLayoutStore()
  const { sessions, projects, deleteSession, toggleFavorite, reconnectSession, assignProject, renameSession } = useSessionStore()

  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; session: Session } | null>(null)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [zoomIndicator, setZoomIndicator] = useState<number | null>(null)
  const [canvasFilter, setCanvasFilter] = useState<CanvasFilter>({
    favoritesOnly: false,
    status: 'all',
    projectId: null,
  })

  const getProjectColor = useCallback(
    (projectId: string | null) => projects.find((project) => project.id === projectId)?.color ?? null,
    [projects],
  )

  const handleDeleteSession = useCallback((sessionId: string) => {
    deleteSession(sessionId)
    removeBoardNode(sessionId)
  }, [deleteSession, removeBoardNode])

  const handleReconnectSession = useCallback((sessionId: string) => {
    void reconnectSession(sessionId).catch((error) => {
      console.error('再接続エラー:', error)
    })
  }, [reconnectSession])

  const flowNodes = useMemo(() => buildFlowNodes({
    boardNodes,
    fileTiles,
    sessions,
    projects,
    activeSessionId,
    canvasFilter,
    getProjectColor,
    onDeleteSession: handleDeleteSession,
    onFocusSession: setActiveSession,
    onToggleFavorite: (sessionId) => {
      void toggleFavorite(sessionId)
    },
    onReconnectSession: handleReconnectSession,
    onRemoveFileTile: removeFileTile,
  }), [
    activeSessionId,
    boardNodes,
    canvasFilter,
    fileTiles,
    getProjectColor,
    handleDeleteSession,
    handleReconnectSession,
    projects,
    removeFileTile,
    sessions,
    setActiveSession,
    toggleFavorite,
  ])

  const flowEdges = useMemo(() => buildFlowEdges(boardEdges), [boardEdges])
  const [nodes, setNodes] = useNodesState(flowNodes)
  const [edges, setEdges] = useEdgesState(flowEdges)

  useEffect(() => {
    if (!isResizingRef.current) {
      setNodes(flowNodes)
    }
  }, [flowNodes, setNodes])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  useEffect(() => () => {
    if (zoomIndicatorTimerRef.current) {
      clearTimeout(zoomIndicatorTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!activeSessionId || activeSessionId === previousActiveSessionIdRef.current) {
      previousActiveSessionIdRef.current = activeSessionId
      return
    }

    const boardNode = boardNodes.find((node) => node.sessionId === activeSessionId)
    if (boardNode) {
      setCenter(boardNode.x + boardNode.width / 2, boardNode.y + boardNode.height / 2, {
        zoom: 0.8,
        duration: 300,
      })
    }

    previousActiveSessionIdRef.current = activeSessionId
  }, [activeSessionId, boardNodes, setCenter])

  const onInit = useCallback(() => {
    if (boardNodes.length > 0) {
      fitView({ padding: 0.3, duration: 300 })
    }
  }, [boardNodes.length, fitView])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const relevantChanges = draggingNodeIdRef.current
      ? changes.filter((change) => change.type !== 'position' || change.id === draggingNodeIdRef.current)
      : changes

    const selectedChange = relevantChanges.find(
      (change): change is NodeChange & { type: 'select'; id: string; selected: true } =>
        change.type === 'select' && 'selected' in change && change.selected === true,
    )

    if (selectedChange) {
      setNodes((currentNodes) =>
        applyNodeChanges(relevantChanges, currentNodes).map((node) => ({
          ...node,
          selected: node.id === selectedChange.id,
        })),
      )
    } else {
      setNodes((currentNodes) => applyNodeChanges(relevantChanges, currentNodes))
    }

    const fileTileIds = new Set(fileTiles.map((fileTile) => fileTile.id))
    for (const change of relevantChanges) {
      if (change.type !== 'position' || change.dragging !== false || !change.position) {
        continue
      }

      if (fileTileIds.has(change.id)) {
        updateFileTilePosition(change.id, change.position.x, change.position.y)
      } else {
        updateNodePosition(change.id, change.position.x, change.position.y)
      }
    }
  }, [fileTiles, setNodes, updateFileTilePosition, updateNodePosition])

  const onNodesChangeWithResize = useCallback((changes: NodeChange[]) => {
    const fileTileIds = new Set(fileTiles.map((fileTile) => fileTile.id))

    for (const change of changes) {
      if (change.type !== 'dimensions' || !('resizing' in change)) {
        continue
      }

      isResizingRef.current = change.resizing ?? false
      if (change.resizing || !change.dimensions?.width || !change.dimensions?.height) {
        continue
      }

      if (fileTileIds.has(change.id)) {
        updateFileTileSize(change.id, change.dimensions.width, change.dimensions.height)
      } else {
        updateNodeSize(change.id, change.dimensions.width, change.dimensions.height)
      }
    }

    onNodesChange(changes)
  }, [fileTiles, onNodesChange, updateFileTileSize, updateNodeSize])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges))
    changes.forEach((change) => {
      if (change.type === 'remove') {
        removeEdge(change.id)
      }
    })
  }, [removeEdge, setEdges])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return
    }

    const newEdge: BoardEdge = {
      id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source,
      target: connection.target,
    }

    addEdge(newEdge)
    setEdges((currentEdges) => reactFlowAddEdge({
      ...connection,
      id: newEdge.id,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#2dd4bf', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#2dd4bf',
      },
    }, currentEdges))
  }, [addEdge, setEdges])

  const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
    setViewport({ x: nextViewport.x, y: nextViewport.y, zoom: nextViewport.zoom })
    setZoomIndicator(Math.round(nextViewport.zoom * 100))

    if (zoomIndicatorTimerRef.current) {
      clearTimeout(zoomIndicatorTimerRef.current)
    }

    zoomIndicatorTimerRef.current = setTimeout(() => {
      setZoomIndicator(null)
    }, 1500)
  }, [setViewport])

  const onNodeDragStart = useCallback((event: ReactMouseEvent, node: Node) => {
    draggingNodeIdRef.current = node.id
    if (node.id.startsWith('group-')) {
      groupDragStartRef.current = { x: node.position.x, y: node.position.y }
    }

    if (!event.shiftKey) {
      setNodes((currentNodes) => currentNodes.map((currentNode) => ({
        ...currentNode,
        selected: currentNode.id === node.id,
      })))
    }
  }, [setNodes])

  const onNodeDragStop = useCallback((_event: ReactMouseEvent, node: Node) => {
    if (node.id.startsWith('group-') && groupDragStartRef.current) {
      const projectId = node.id.replace('group-', '')
      const dx = node.position.x - groupDragStartRef.current.x
      const dy = node.position.y - groupDragStartRef.current.y

      if (dx !== 0 || dy !== 0) {
        boardNodes.forEach((boardNode) => {
          const session = sessions.find((candidate) => candidate.id === boardNode.sessionId)
          if (session?.projectId === projectId) {
            updateNodePosition(boardNode.sessionId, boardNode.x + dx, boardNode.y + dy)
          }
        })
      }
    }

    draggingNodeIdRef.current = null
    groupDragStartRef.current = null
  }, [boardNodes, sessions, updateNodePosition])

  const handleAutoLayout = useCallback(() => {
    setBoardNodes(autoLayoutBoardNodes(boardNodes, sessions))
  }, [boardNodes, sessions, setBoardNodes])

  const handleZoomReset = useCallback(() => {
    fitView({ padding: 0.3, duration: 300 })
  }, [fitView])

  return (
    <div className="w-full h-full">
      <CanvasToolbar
        filter={canvasFilter}
        onFilterChange={setCanvasFilter}
        zoom={viewport.zoom}
        onZoomIn={() => zoomIn({ duration: 200 })}
        onZoomOut={() => zoomOut({ duration: 200 })}
        onZoomReset={handleZoomReset}
        onFitView={() => fitView({ padding: 0.3, duration: 300 })}
        onAutoLayout={handleAutoLayout}
        projects={projects}
        sessionCount={boardNodes.length}
        fileTileCount={fileTiles.length}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeWithResize}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMoveEnd={onMoveEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => {
          setActiveSession(null)
          setNodeContextMenu(null)
          setCanvasContextMenu(null)
        }}
        onDoubleClick={() => {
          window.dispatchEvent(new CustomEvent('focus-create-session'))
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          if (node.id.startsWith('group-')) {
            return
          }

          const session = sessions.find((candidate) => candidate.id === node.id)
          if (!session) {
            return
          }

          setCanvasContextMenu(null)
          setNodeContextMenu({ x: event.clientX, y: event.clientY, session })
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setNodeContextMenu(null)
          setCanvasContextMenu({ x: event.clientX, y: event.clientY })
        }}
        onInit={onInit}
        multiSelectionKeyCode="Shift"
        nodeTypes={boardNodeTypes}
        minZoom={0.33}
        maxZoom={1}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        className="bg-surface-0 [&_.react-flow__pane]:bg-surface-0"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#1e2d3d" />
        <MiniMap
          style={{ background: '#0b0f13' }}
          maskColor="rgba(15, 20, 25, 0.7)"
          nodeColor={(node) => {
            if (node.type === 'file') {
              return '#2dd4bf'
            }
            if (node.type === 'projectGroup') {
              return 'transparent'
            }
            return '#94a3b8'
          }}
          nodeStrokeColor="#1e2d3d"
          pannable
          zoomable
        />
      </ReactFlow>

      {boardNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-text-muted space-y-3">
            <p className="text-2xl font-bold text-text-secondary">Kurimats</p>
            <p className="text-sm">ダブルクリックでターミナルを作成</p>
            <p className="text-xs text-text-muted">または右クリックでメニューを開く</p>
          </div>
        </div>
      )}

      {zoomIndicator !== null && (
        <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-chrome/90 border border-border rounded-lg text-xs text-text-secondary font-mono animate-fade-in pointer-events-none z-10">
          {zoomIndicator}%
        </div>
      )}

      {nodeContextMenu && (
        <NodeContextMenu
          position={{ x: nodeContextMenu.x, y: nodeContextMenu.y }}
          session={nodeContextMenu.session}
          projects={projects}
          onClose={() => setNodeContextMenu(null)}
          onDelete={() => handleDeleteSession(nodeContextMenu.session.id)}
          onToggleFavorite={() => void toggleFavorite(nodeContextMenu.session.id)}
          onAssignProject={(projectId) => void assignProject(nodeContextMenu.session.id, projectId)}
          onRename={(name) => void renameSession(nodeContextMenu.session.id, name)}
        />
      )}

      {canvasContextMenu && (
        <CanvasContextMenu
          position={{ x: canvasContextMenu.x, y: canvasContextMenu.y }}
          onClose={() => setCanvasContextMenu(null)}
          onCreateSession={() => {
            window.dispatchEvent(new CustomEvent('focus-create-session'))
          }}
          onAutoLayout={handleAutoLayout}
        />
      )}
    </div>
  )
}

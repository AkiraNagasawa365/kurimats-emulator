import { MarkerType, type Edge, type Node, type NodeTypes } from '@xyflow/react'
import { matchesCanvasFilter, type BoardEdge, type FileTilePosition, type Project, type Session } from '@kurimats/shared'
import { FileNode, type FileNodeData } from './FileNode'
import { ProjectGroupNode, type ProjectGroupNodeData } from './ProjectGroupNode'
import { SessionNode, type SessionNodeData } from './SessionNode'

export const GROUP_PADDING = 40

// react-flow の NodeTypes ジェネリクスとの型不一致を回避
export const boardNodeTypes = {
  session: SessionNode,
  projectGroup: ProjectGroupNode,
  file: FileNode,
} as NodeTypes

export interface CanvasFilter {
  favoritesOnly: boolean
  status: Session['status'] | 'all'
  projectId: string | null
}

interface BuildFlowNodesParams {
  boardNodes: Array<{ sessionId: string; x: number; y: number; width: number; height: number }>
  fileTiles: FileTilePosition[]
  sessions: Session[]
  projects: Project[]
  activeSessionId: string | null
  canvasFilter: CanvasFilter
  getProjectColor: (projectId: string | null) => string | null
  onDeleteSession: (sessionId: string) => void
  onFocusSession: (sessionId: string) => void
  onToggleFavorite: (sessionId: string) => void
  onReconnectSession: (sessionId: string) => void
  onRemoveFileTile: (id: string) => void
}

export function buildFlowNodes({
  boardNodes,
  fileTiles,
  sessions,
  projects,
  activeSessionId,
  canvasFilter,
  getProjectColor,
  onDeleteSession,
  onFocusSession,
  onToggleFavorite,
  onReconnectSession,
  onRemoveFileTile,
}: BuildFlowNodesParams): Node[] {
  const nodes: Node[] = []
  const projectGroups = new Map<string, { color: string; name: string; minX: number; minY: number; maxX: number; maxY: number }>()

  for (const boardNode of boardNodes) {
    const session = sessions.find((candidate) => candidate.id === boardNode.sessionId)
    if (!session?.projectId) {
      continue
    }

    const project = projects.find((candidate) => candidate.id === session.projectId)
    if (!project) {
      continue
    }

    const group = projectGroups.get(session.projectId)
    if (group) {
      group.minX = Math.min(group.minX, boardNode.x)
      group.minY = Math.min(group.minY, boardNode.y)
      group.maxX = Math.max(group.maxX, boardNode.x + boardNode.width)
      group.maxY = Math.max(group.maxY, boardNode.y + boardNode.height)
      continue
    }

    projectGroups.set(session.projectId, {
      color: project.color,
      name: project.name,
      minX: boardNode.x,
      minY: boardNode.y,
      maxX: boardNode.x + boardNode.width,
      maxY: boardNode.y + boardNode.height,
    })
  }

  for (const [projectId, group] of projectGroups) {
    const memberCount = boardNodes.filter((boardNode) => {
      const session = sessions.find((candidate) => candidate.id === boardNode.sessionId)
      return session?.projectId === projectId
    }).length

    if (memberCount < 2) {
      continue
    }

    nodes.push({
      id: `group-${projectId}`,
      type: 'projectGroup',
      position: { x: group.minX - GROUP_PADDING, y: group.minY - GROUP_PADDING },
      data: {
        label: group.name,
        color: group.color,
        projectId,
      } satisfies ProjectGroupNodeData,
      style: {
        width: group.maxX - group.minX + GROUP_PADDING * 2,
        height: group.maxY - group.minY + GROUP_PADDING * 2,
      },
      selectable: false,
      draggable: true,
      zIndex: -1,
    })
  }

  for (const boardNode of boardNodes) {
    const session = sessions.find((candidate) => candidate.id === boardNode.sessionId)
    if (!session || !matchesCanvasFilter(session, canvasFilter)) {
      continue
    }

    nodes.push({
      id: boardNode.sessionId,
      type: 'session',
      position: { x: boardNode.x, y: boardNode.y },
      data: {
        session,
        isActive: boardNode.sessionId === activeSessionId,
        projectColor: getProjectColor(session.projectId),
        onClose: () => onDeleteSession(session.id),
        onFocus: () => onFocusSession(session.id),
        onToggleFavorite: () => onToggleFavorite(session.id),
        onReconnect: session.status === 'disconnected'
          ? () => onReconnectSession(session.id)
          : undefined,
      } satisfies SessionNodeData,
      style: {
        width: boardNode.width,
        height: boardNode.height,
      },
      selected: boardNode.sessionId === activeSessionId,
      dragHandle: '.drag-handle',
      zIndex: 1,
    })
  }

  for (const fileTile of fileTiles) {
    nodes.push({
      id: fileTile.id,
      type: 'file',
      position: { x: fileTile.x, y: fileTile.y },
      data: {
        filePath: fileTile.filePath,
        language: fileTile.language,
        onClose: () => onRemoveFileTile(fileTile.id),
      } satisfies FileNodeData,
      style: {
        width: fileTile.width,
        height: fileTile.height,
      },
      dragHandle: '.drag-handle',
      zIndex: 2,
    })
  }

  return nodes
}

export function buildFlowEdges(boardEdges: BoardEdge[]): Edge[] {
  return boardEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? '',
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#2dd4bf', strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#2dd4bf',
    },
  }))
}

export function autoLayoutBoardNodes(
  boardNodes: Array<{ sessionId: string; x: number; y: number; width: number; height: number }>,
  sessions: Session[],
): Array<{ sessionId: string; x: number; y: number; width: number; height: number }> {
  if (boardNodes.length === 0) {
    return boardNodes
  }

  const gap = 40
  const groupGap = 80
  const nodeWidth = 520
  const nodeHeight = 620
  const groupedSessionIds = new Map<string, string[]>()
  const unassignedSessionIds: string[] = []

  for (const boardNode of boardNodes) {
    const projectId = sessions.find((session) => session.id === boardNode.sessionId)?.projectId
    if (!projectId) {
      unassignedSessionIds.push(boardNode.sessionId)
      continue
    }

    const group = groupedSessionIds.get(projectId) ?? []
    group.push(boardNode.sessionId)
    groupedSessionIds.set(projectId, group)
  }

  const positionMap = new Map<string, { x: number; y: number }>()
  let currentY = 0

  for (const [, memberIds] of groupedSessionIds) {
    memberIds.forEach((sessionId, index) => {
      positionMap.set(sessionId, {
        x: index * (nodeWidth + gap),
        y: currentY,
      })
    })
    currentY += nodeHeight + groupGap
  }

  const unassignedColumns = Math.max(1, Math.ceil(Math.sqrt(unassignedSessionIds.length)))
  unassignedSessionIds.forEach((sessionId, index) => {
    positionMap.set(sessionId, {
      x: (index % unassignedColumns) * (nodeWidth + gap),
      y: currentY + Math.floor(index / unassignedColumns) * (nodeHeight + gap),
    })
  })

  return boardNodes.map((boardNode) => {
    const position = positionMap.get(boardNode.sessionId)
    return position ? { ...boardNode, x: position.x, y: position.y } : boardNode
  })
}

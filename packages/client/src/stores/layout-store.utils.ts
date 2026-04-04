import type {
  BoardNodePosition,
  FileTilePosition,
  LayoutMode,
} from '@kurimats/shared'
import { findOptimalPosition, type CardRect } from '../lib/layout-engine'

export const DEFAULT_NODE_WIDTH = 520
export const DEFAULT_NODE_HEIGHT = 620
export const DEFAULT_FILE_TILE_WIDTH = 500
export const DEFAULT_FILE_TILE_HEIGHT = 400
export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 }
export const MODE_PROGRESSION: LayoutMode[] = ['1x1', '2x1', '2x2']

export function panelCountForMode(mode: LayoutMode): number {
  switch (mode) {
    case '1x1':
      return 1
    case '2x1':
    case '1x2':
      return 2
    case '2x2':
      return 4
    case '3x1':
      return 3
  }
}

export function toCardRects(
  sessionNodes: BoardNodePosition[],
  fileTiles: FileTilePosition[] = [],
): CardRect[] {
  return [
    ...sessionNodes.map((node) => ({
      id: node.sessionId,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })),
    ...fileTiles.map((tile) => ({
      id: tile.id,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    })),
  ]
}

export function findBoardNodePosition(
  boardNodes: BoardNodePosition[],
  siblingSessionIds?: string[],
): { x: number; y: number } {
  const existingCards = toCardRects(boardNodes)
  const siblings = siblingSessionIds
    ? boardNodes.filter((node) => siblingSessionIds.includes(node.sessionId))
    : []

  if (siblings.length === 0) {
    return findOptimalPosition(
      existingCards,
      { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
      3000,
      3000,
    )
  }

  const rightmostSibling = siblings.reduce((rightmost, node) =>
    node.x + node.width > rightmost.x + rightmost.width ? node : rightmost,
  )
  const candidateX = rightmostSibling.x + rightmostSibling.width + 40
  const candidateY = rightmostSibling.y
  const overlaps = existingCards.some((card) =>
    candidateX < card.x + card.width &&
    candidateX + DEFAULT_NODE_WIDTH > card.x &&
    candidateY < card.y + card.height &&
    candidateY + DEFAULT_NODE_HEIGHT > card.y,
  )

  if (!overlaps) {
    return { x: candidateX, y: candidateY }
  }

  return findOptimalPosition(
    existingCards,
    { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
    3000,
    3000,
  )
}

export function findFileTilePosition(
  boardNodes: BoardNodePosition[],
  fileTiles: FileTilePosition[],
): { x: number; y: number } {
  return findOptimalPosition(
    toCardRects(boardNodes, fileTiles),
    { width: DEFAULT_FILE_TILE_WIDTH, height: DEFAULT_FILE_TILE_HEIGHT },
    3000,
    3000,
  )
}

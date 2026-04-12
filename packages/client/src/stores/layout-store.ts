import { create } from 'zustand'
import type {
  AutoLayoutMode,
  BoardEdge,
  BoardNodePosition,
  FileTilePosition,
  LayoutMode,
  LayoutPanel,
} from '@kurimats/shared'
import {
  detectOverlaps,
  flowLayout,
  gridLayout,
  resolveOverlaps,
  treeLayout,
  type CardRect,
} from '../lib/layout-engine'
import {
  clearLayoutPersistenceTimers,
  persistBoardState,
  persistLayoutState,
  readBoardSavedAt,
  readLayoutSavedAt,
  readSavedBoardLayout,
  readSavedLayout,
} from './layout-store.persistence'
import {
  DEFAULT_FILE_TILE_HEIGHT,
  DEFAULT_FILE_TILE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_VIEWPORT,
  MODE_PROGRESSION,
  findBoardNodePosition,
  findFileTilePosition,
  panelCountForMode,
  toCardRects,
} from './layout-store.utils'
import { layoutApi } from '../lib/api'

/** お気に入りフィルタ適用前のレイアウト退避データ */
interface SavedLayoutSnapshot {
  mode: LayoutMode
  panels: LayoutPanel[]
  activePanelIndex: number
}

interface LayoutState {
  mode: LayoutMode
  panels: LayoutPanel[]
  activePanelIndex: number
  autoLayoutMode: AutoLayoutMode
  maximizedPanelIndex: number | null
  boardNodes: BoardNodePosition[]
  boardEdges: BoardEdge[]
  fileTiles: FileTilePosition[]
  activeSessionId: string | null
  viewport: { x: number; y: number; zoom: number }
  savedLayoutBeforeFavorites: SavedLayoutSnapshot | null
  setMode: (mode: LayoutMode) => void
  assignSession: (panelIndex: number, sessionId: string) => void
  removeSession: (sessionId: string) => void
  setActivePanel: (index: number) => void
  addPanel: (sessionId: string, siblingSessionIds?: string[]) => void
  loadSavedLayout: () => Promise<void>
  setAutoLayoutMode: (mode: AutoLayoutMode) => void
  autoArrange: (containerWidth: number, containerHeight: number) => CardRect[]
  toggleMaximize: (index: number) => void
  setActiveSession: (sessionId: string | null) => void
  updateNodePosition: (sessionId: string, x: number, y: number) => void
  updateNodeSize: (sessionId: string, width: number, height: number) => void
  addBoardNode: (sessionId: string, siblingSessionIds?: string[]) => void
  removeBoardNode: (sessionId: string) => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  setBoardNodes: (nodes: BoardNodePosition[]) => void
  addEdge: (edge: BoardEdge) => void
  removeEdge: (edgeId: string) => void
  setBoardEdges: (edges: BoardEdge[]) => void
  addFileTile: (filePath: string, language: string) => void
  removeFileTile: (id: string) => void
  updateFileTilePosition: (id: string, x: number, y: number) => void
  updateFileTileSize: (id: string, width: number, height: number) => void
  showFavoritesOnly: (favoriteSessionIds: string[]) => void
  restoreFromFavorites: () => void
}

const savedState = readSavedLayout()
const savedBoardState = readSavedBoardLayout()
let latestLoadRequestId = 0

function buildBoardSnapshot(state: Pick<LayoutState, 'boardNodes' | 'boardEdges' | 'fileTiles' | 'viewport'>) {
  return {
    nodes: state.boardNodes,
    edges: state.boardEdges,
    fileTiles: state.fileTiles,
    viewport: state.viewport,
  }
}

function persistCurrentBoardState(get: () => LayoutState): void {
  persistBoardState(buildBoardSnapshot(get()))
}

function persistCurrentLayoutState(get: () => LayoutState): void {
  const state = get()
  persistLayoutState({
    mode: state.mode,
    panels: state.panels,
    activePanelIndex: state.activePanelIndex,
  })
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  mode: savedState?.mode ?? '1x1',
  panels: savedState?.panels ?? [{ sessionId: null, position: 0 }],
  activePanelIndex: savedState?.activePanelIndex ?? 0,
  autoLayoutMode: 'grid',
  maximizedPanelIndex: null,
  boardNodes: savedBoardState?.nodes ?? [],
  boardEdges: savedBoardState?.edges ?? [],
  fileTiles: savedBoardState?.fileTiles ?? [],
  activeSessionId: null,
  viewport: savedBoardState?.viewport ?? DEFAULT_VIEWPORT,
  savedLayoutBeforeFavorites: null,

  setMode: (mode) => {
    const count = panelCountForMode(mode)
    const currentPanels = get().panels
    const panels: LayoutPanel[] = Array.from({ length: count }, (_, index) => ({
      sessionId: currentPanels[index]?.sessionId ?? null,
      position: index,
    }))

    set({
      mode,
      panels,
      activePanelIndex: Math.min(get().activePanelIndex, count - 1),
    })
    persistCurrentLayoutState(get)
  },

  assignSession: (panelIndex, sessionId) => {
    const panels = [...get().panels]
    if (!panels[panelIndex]) {
      return
    }

    panels[panelIndex] = { ...panels[panelIndex], sessionId }
    set({ panels })
    persistCurrentLayoutState(get)
  },

  removeSession: (sessionId) => {
    const panels = get().panels.map((panel) =>
      panel.sessionId === sessionId ? { ...panel, sessionId: null } : panel,
    )
    const boardNodes = get().boardNodes.filter((node) => node.sessionId !== sessionId)
    const boardEdges = get().boardEdges.filter((edge) => edge.source !== sessionId && edge.target !== sessionId)

    set({
      panels,
      boardNodes,
      boardEdges,
      activeSessionId: get().activeSessionId === sessionId ? null : get().activeSessionId,
    })
    persistCurrentLayoutState(get)
    persistCurrentBoardState(get)
  },

  setActivePanel: (index) => {
    set({ activePanelIndex: index })
    persistCurrentLayoutState(get)
  },

  addPanel: (sessionId, siblingSessionIds) => {
    const state = get()

    if (!state.boardNodes.some((node) => node.sessionId === sessionId)) {
      state.addBoardNode(sessionId, siblingSessionIds)
    } else {
      set({ activeSessionId: sessionId })
    }

    const emptyIndex = get().panels.findIndex((panel) => panel.sessionId === null)
    if (emptyIndex >= 0) {
      const panels = [...get().panels]
      panels[emptyIndex] = { ...panels[emptyIndex], sessionId }
      set({ panels, activePanelIndex: emptyIndex })
      persistCurrentLayoutState(get)
      return
    }

    const currentModeIndex = MODE_PROGRESSION.indexOf(get().mode)
    if (currentModeIndex < 0 || currentModeIndex >= MODE_PROGRESSION.length - 1) {
      return
    }

    const nextMode = MODE_PROGRESSION[currentModeIndex + 1]
    const nextPanelCount = panelCountForMode(nextMode)
    const panels: LayoutPanel[] = Array.from({ length: nextPanelCount }, (_, index) => ({
      sessionId: get().panels[index]?.sessionId ?? null,
      position: index,
    }))
    const firstEmptyIndex = panels.findIndex((panel) => panel.sessionId === null)
    const targetIndex = firstEmptyIndex >= 0 ? firstEmptyIndex : panels.length - 1
    panels[targetIndex] = { ...panels[targetIndex], sessionId }

    set({
      mode: nextMode,
      panels,
      activePanelIndex: targetIndex,
    })
    persistCurrentLayoutState(get)
  },

  loadSavedLayout: async () => {
    const requestId = ++latestLoadRequestId

    try {
      const serverLayout = await layoutApi.get()
      if (requestId !== latestLoadRequestId) {
        return
      }

      if (serverLayout && serverLayout.savedAt > readLayoutSavedAt()) {
        set({
          mode: serverLayout.mode,
          panels: serverLayout.panels,
          activePanelIndex: serverLayout.activePanelIndex,
        })
      }
    } catch {
      // 読み込み失敗時はローカル状態を維持する
    }

    try {
      const serverBoard = await layoutApi.getBoard()
      if (requestId !== latestLoadRequestId) {
        return
      }

      if (serverBoard && serverBoard.savedAt > readBoardSavedAt()) {
        set({
          boardNodes: serverBoard.nodes,
          boardEdges: serverBoard.edges ?? [],
          fileTiles: serverBoard.fileTiles ?? [],
          viewport: serverBoard.viewport,
        })
      }
    } catch {
      // 読み込み失敗時はローカル状態を維持する
    }

    const currentNodes = get().boardNodes
    if (currentNodes.length <= 1) {
      return
    }

    const overlaps = detectOverlaps(toCardRects(currentNodes))
    if (overlaps.length === 0) {
      return
    }

    console.log(`⚠️ ${overlaps.length}件の重なりを検出したため、自動補正します`)
    const resolvedCards = resolveOverlaps(toCardRects(currentNodes), 6000)
    const resolvedNodes = currentNodes.map((node) => {
      const resolved = resolvedCards.find((card) => card.id === node.sessionId)
      return resolved ? { ...node, x: resolved.x, y: resolved.y } : node
    })

    set({ boardNodes: resolvedNodes })
    persistCurrentBoardState(get)
  },

  setAutoLayoutMode: (mode) => {
    set({ autoLayoutMode: mode })
  },

  autoArrange: (containerWidth, containerHeight) => {
    const { panels, autoLayoutMode } = get()
    const cards: CardRect[] = panels
      .filter((panel): panel is LayoutPanel & { sessionId: string } => panel.sessionId !== null)
      .map((panel) => ({
        id: panel.sessionId,
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        projectId: null,
      }))

    switch (autoLayoutMode) {
      case 'grid':
        return gridLayout(cards, containerWidth, containerHeight)
      case 'flow':
        return flowLayout(cards, containerWidth)
      case 'tree':
        return treeLayout(cards, containerWidth, containerHeight)
      default:
        return cards
    }
  },

  toggleMaximize: (index) => {
    set({ maximizedPanelIndex: get().maximizedPanelIndex === index ? null : index })
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  updateNodePosition: (sessionId, x, y) => {
    set({
      boardNodes: get().boardNodes.map((node) =>
        node.sessionId === sessionId ? { ...node, x, y } : node,
      ),
    })
    persistCurrentBoardState(get)
  },

  updateNodeSize: (sessionId, width, height) => {
    set({
      boardNodes: get().boardNodes.map((node) =>
        node.sessionId === sessionId ? { ...node, width, height } : node,
      ),
    })
    persistCurrentBoardState(get)
  },

  addBoardNode: (sessionId, siblingSessionIds) => {
    const boardNodes = get().boardNodes
    if (boardNodes.some((node) => node.sessionId === sessionId)) {
      return
    }

    const position = findBoardNodePosition(boardNodes, siblingSessionIds)
    const nextBoardNodes = [
      ...boardNodes,
      {
        sessionId,
        x: position.x,
        y: position.y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      },
    ]

    set({ boardNodes: nextBoardNodes, activeSessionId: sessionId })
    persistCurrentBoardState(get)
  },

  removeBoardNode: (sessionId) => {
    set({
      boardNodes: get().boardNodes.filter((node) => node.sessionId !== sessionId),
      boardEdges: get().boardEdges.filter((edge) => edge.source !== sessionId && edge.target !== sessionId),
      activeSessionId: get().activeSessionId === sessionId ? null : get().activeSessionId,
    })
    persistCurrentBoardState(get)
  },

  setViewport: (viewport) => {
    set({ viewport })
    persistCurrentBoardState(get)
  },

  setBoardNodes: (boardNodes) => {
    set({ boardNodes })
    persistCurrentBoardState(get)
  },

  addEdge: (edge) => {
    const hasDuplicate = get().boardEdges.some(
      (existingEdge) => existingEdge.source === edge.source && existingEdge.target === edge.target,
    )
    if (hasDuplicate) {
      return
    }

    set({ boardEdges: [...get().boardEdges, edge] })
    persistCurrentBoardState(get)
  },

  removeEdge: (edgeId) => {
    set({ boardEdges: get().boardEdges.filter((edge) => edge.id !== edgeId) })
    persistCurrentBoardState(get)
  },

  setBoardEdges: (boardEdges) => {
    set({ boardEdges })
    persistCurrentBoardState(get)
  },

  addFileTile: (filePath, language) => {
    const { boardNodes, fileTiles } = get()
    if (fileTiles.some((tile) => tile.filePath === filePath)) {
      return
    }

    const position = findFileTilePosition(boardNodes, fileTiles)
    const nextFileTiles = [
      ...fileTiles,
      {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filePath,
        language,
        x: position.x,
        y: position.y,
        width: DEFAULT_FILE_TILE_WIDTH,
        height: DEFAULT_FILE_TILE_HEIGHT,
      },
    ]

    set({ fileTiles: nextFileTiles })
    persistCurrentBoardState(get)
  },

  removeFileTile: (id) => {
    set({ fileTiles: get().fileTiles.filter((tile) => tile.id !== id) })
    persistCurrentBoardState(get)
  },

  updateFileTilePosition: (id, x, y) => {
    set({
      fileTiles: get().fileTiles.map((tile) => (tile.id === id ? { ...tile, x, y } : tile)),
    })
    persistCurrentBoardState(get)
  },

  updateFileTileSize: (id, width, height) => {
    set({
      fileTiles: get().fileTiles.map((tile) => (tile.id === id ? { ...tile, width, height } : tile)),
    })
    persistCurrentBoardState(get)
  },

  showFavoritesOnly: (favoriteSessionIds) => {
    if (favoriteSessionIds.length === 0) {
      return
    }

    const state = get()
    // 現在のレイアウトを退避
    set({
      savedLayoutBeforeFavorites: {
        mode: state.mode,
        panels: [...state.panels],
        activePanelIndex: state.activePanelIndex,
      },
    })

    // セッション数に応じた最適モードを決定
    const count = favoriteSessionIds.length
    const targetMode = MODE_PROGRESSION.find(m => panelCountForMode(m) >= count)
      ?? MODE_PROGRESSION[MODE_PROGRESSION.length - 1]
    const panelCount = panelCountForMode(targetMode)

    // お気に入りセッションで均等にパネルを構築
    const panels: LayoutPanel[] = Array.from({ length: panelCount }, (_, i) => ({
      sessionId: favoriteSessionIds[i] ?? null,
      position: i,
    }))

    // ボードに未追加のセッションがあれば追加
    for (const sessionId of favoriteSessionIds) {
      if (!get().boardNodes.some(node => node.sessionId === sessionId)) {
        get().addBoardNode(sessionId)
      }
    }

    set({ mode: targetMode, panels, activePanelIndex: 0 })
    persistCurrentLayoutState(get)
  },

  restoreFromFavorites: () => {
    const saved = get().savedLayoutBeforeFavorites
    if (!saved) {
      return
    }

    set({
      mode: saved.mode,
      panels: saved.panels,
      activePanelIndex: saved.activePanelIndex,
      savedLayoutBeforeFavorites: null,
    })
    persistCurrentLayoutState(get)
  },
}))

// vitest のインラインテスト用クリーンアップ
if ((import.meta as any).vitest) {
  ;(import.meta as any).vitest.afterEach(() => {
    clearLayoutPersistenceTimers()
  })
}

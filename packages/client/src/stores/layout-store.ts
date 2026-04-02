import { create } from 'zustand'
import type { LayoutMode, AutoLayoutMode, BoardNodePosition, BoardEdge } from '@kurimats/shared'
import { layoutApi } from '../lib/api'
import { gridLayout, flowLayout, treeLayout, findOptimalPosition, type CardRect } from '../lib/layout-engine'

interface PanelInfo {
  sessionId: string | null
  position: number
}

// ボードノードのデフォルトサイズ
const DEFAULT_NODE_WIDTH = 600
const DEFAULT_NODE_HEIGHT = 480

interface LayoutState {
  mode: LayoutMode
  panels: PanelInfo[]
  activePanelIndex: number
  autoLayoutMode: AutoLayoutMode
  maximizedPanelIndex: number | null

  // ボードキャンバス用
  boardNodes: BoardNodePosition[]
  boardEdges: BoardEdge[]
  activeSessionId: string | null
  viewport: { x: number; y: number; zoom: number }

  setMode: (mode: LayoutMode) => void
  assignSession: (panelIndex: number, sessionId: string) => void
  removeSession: (sessionId: string) => void
  setActivePanel: (index: number) => void
  addPanel: (sessionId: string) => void
  loadSavedLayout: () => Promise<void>
  setAutoLayoutMode: (mode: AutoLayoutMode) => void
  autoArrange: (containerWidth: number, containerHeight: number) => CardRect[]
  toggleMaximize: (index: number) => void

  // ボードキャンバス用アクション
  setActiveSession: (sessionId: string | null) => void
  updateNodePosition: (sessionId: string, x: number, y: number) => void
  updateNodeSize: (sessionId: string, width: number, height: number) => void
  addBoardNode: (sessionId: string) => void
  removeBoardNode: (sessionId: string) => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  setBoardNodes: (nodes: BoardNodePosition[]) => void

  // エッジ（コネクター線）用アクション
  addEdge: (edge: BoardEdge) => void
  removeEdge: (edgeId: string) => void
  setBoardEdges: (edges: BoardEdge[]) => void
}

const STORAGE_KEY = 'kurimats-layout'
const BOARD_STORAGE_KEY = 'kurimats-board-layout'

function panelCountForMode(mode: LayoutMode): number {
  switch (mode) {
    case '1x1': return 1
    case '2x1':
    case '1x2': return 2
    case '2x2': return 4
    case '3x1': return 3
  }
}

// レイアウト状態の永続化（デバウンス付き）
let saveTimeout: ReturnType<typeof setTimeout> | null = null

function persistLayout(state: { mode: LayoutMode; panels: PanelInfo[]; activePanelIndex: number }) {
  const layoutData = {
    mode: state.mode,
    panels: state.panels,
    activePanelIndex: state.activePanelIndex,
    savedAt: Date.now(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutData))
  } catch {
    // localStorage利用不可の場合は無視
  }

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    layoutApi.save(layoutData).catch(() => {
      // サーバー保存失敗は無視
    })
  }, 1000)
}

let boardSaveTimeout: ReturnType<typeof setTimeout> | null = null

function persistBoardLayout(nodes: BoardNodePosition[], edges: BoardEdge[], viewport: { x: number; y: number; zoom: number }) {
  const data = { nodes, edges, viewport, savedAt: Date.now() }
  try {
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage利用不可の場合は無視
  }

  if (boardSaveTimeout) clearTimeout(boardSaveTimeout)
  boardSaveTimeout = setTimeout(() => {
    layoutApi.saveBoard(data).catch(() => {
      // サーバー保存失敗は無視
    })
  }, 1000)
}

function loadFromStorage(): Partial<LayoutState> | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      return {
        mode: data.mode,
        panels: data.panels,
        activePanelIndex: data.activePanelIndex,
      }
    }
  } catch {
    // パースエラーは無視
  }
  return null
}

function loadBoardFromStorage(): { nodes: BoardNodePosition[]; edges: BoardEdge[]; viewport: { x: number; y: number; zoom: number } } | null {
  try {
    const saved = localStorage.getItem(BOARD_STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
        viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
      }
    }
  } catch {
    // パースエラーは無視
  }
  return null
}

// 初期状態をlocalStorageから復元
const savedState = loadFromStorage()
const savedBoardState = loadBoardFromStorage()

export const useLayoutStore = create<LayoutState>((set, get) => ({
  mode: savedState?.mode ?? '1x1',
  panels: savedState?.panels ?? [{ sessionId: null, position: 0 }],
  activePanelIndex: savedState?.activePanelIndex ?? 0,
  autoLayoutMode: 'grid' as AutoLayoutMode,
  maximizedPanelIndex: null as number | null,

  // ボードキャンバス用
  boardNodes: savedBoardState?.nodes ?? [],
  boardEdges: savedBoardState?.edges ?? [],
  activeSessionId: null,
  viewport: savedBoardState?.viewport ?? { x: 0, y: 0, zoom: 1 },

  setMode: (mode) => {
    const count = panelCountForMode(mode)
    const current = get().panels
    const panels: PanelInfo[] = Array.from({ length: count }, (_, i) => ({
      sessionId: current[i]?.sessionId ?? null,
      position: i,
    }))
    const newState = { mode, panels, activePanelIndex: Math.min(get().activePanelIndex, count - 1) }
    set(newState)
    persistLayout(newState)
  },

  assignSession: (panelIndex, sessionId) => {
    const panels = [...get().panels]
    if (panels[panelIndex]) {
      panels[panelIndex] = { ...panels[panelIndex], sessionId }
    }
    set({ panels })
    persistLayout({ ...get(), panels })
  },

  removeSession: (sessionId) => {
    const panels = get().panels.map(p =>
      p.sessionId === sessionId ? { ...p, sessionId: null } : p
    )
    set({ panels })
    persistLayout({ ...get(), panels })

    // ボードノードも削除、関連エッジも削除
    const boardNodes = get().boardNodes.filter(n => n.sessionId !== sessionId)
    const boardEdges = get().boardEdges.filter(e => e.source !== sessionId && e.target !== sessionId)
    set({ boardNodes, boardEdges })
    persistBoardLayout(boardNodes, boardEdges, get().viewport)
  },

  setActivePanel: (index) => {
    set({ activePanelIndex: index })
    persistLayout({ ...get(), activePanelIndex: index })
  },

  addPanel: (sessionId) => {
    const { panels, mode, boardNodes } = get()

    // ボードノードも追加
    if (!boardNodes.find(n => n.sessionId === sessionId)) {
      const existingCards: CardRect[] = boardNodes.map(n => ({
        id: n.sessionId,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      }))
      const pos = findOptimalPosition(
        existingCards,
        { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
        3000, // 仮想キャンバス幅
        3000, // 仮想キャンバス高さ
      )
      const newNode: BoardNodePosition = {
        sessionId,
        x: pos.x,
        y: pos.y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      }
      const newBoardNodes = [...boardNodes, newNode]
      set({ boardNodes: newBoardNodes, activeSessionId: sessionId })
      persistBoardLayout(newBoardNodes, get().boardEdges, get().viewport)
    } else {
      set({ activeSessionId: sessionId })
    }

    // 既存グリッドレイアウトの空きパネルを探す
    const emptyIndex = panels.findIndex(p => p.sessionId === null)
    if (emptyIndex >= 0) {
      const newPanels = [...panels]
      newPanels[emptyIndex] = { ...newPanels[emptyIndex], sessionId }
      set({ panels: newPanels, activePanelIndex: emptyIndex })
      persistLayout({ ...get(), panels: newPanels, activePanelIndex: emptyIndex })
      return
    }
    // 空きがなければレイアウト拡張
    const modeProgression: LayoutMode[] = ['1x1', '2x1', '2x2']
    const currentIdx = modeProgression.indexOf(mode)
    if (currentIdx < modeProgression.length - 1) {
      const newMode = modeProgression[currentIdx + 1]
      const count = panelCountForMode(newMode)
      const newPanels: PanelInfo[] = Array.from({ length: count }, (_, i) => ({
        sessionId: panels[i]?.sessionId ?? (i === panels.length ? sessionId : null),
        position: i,
      }))
      const firstEmpty = newPanels.findIndex(p => p.sessionId === null)
      if (firstEmpty >= 0) {
        newPanels[firstEmpty] = { ...newPanels[firstEmpty], sessionId }
      }
      const newState = { mode: newMode, panels: newPanels, activePanelIndex: firstEmpty >= 0 ? firstEmpty : 0 }
      set(newState)
      persistLayout(newState)
    }
  },

  loadSavedLayout: async () => {
    try {
      const serverLayout = await layoutApi.get()
      if (serverLayout) {
        const localSavedAt = (() => {
          try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').savedAt || 0 } catch { return 0 }
        })()
        if (serverLayout.savedAt > localSavedAt) {
          set({
            mode: serverLayout.mode,
            panels: serverLayout.panels,
            activePanelIndex: serverLayout.activePanelIndex,
          })
        }
      }
    } catch {
      // サーバー取得失敗はlocalStorageの状態を維持
    }

    // ボードレイアウトも読み込み
    try {
      const serverBoard = await layoutApi.getBoard()
      if (serverBoard) {
        const localBoardSavedAt = (() => {
          try { return JSON.parse(localStorage.getItem(BOARD_STORAGE_KEY) || '{}').savedAt || 0 } catch { return 0 }
        })()
        if (serverBoard.savedAt > localBoardSavedAt) {
          set({
            boardNodes: serverBoard.nodes,
            boardEdges: serverBoard.edges || [],
            viewport: serverBoard.viewport,
          })
        }
      }
    } catch {
      // サーバー取得失敗は無視
    }
  },

  setAutoLayoutMode: (mode: AutoLayoutMode) => {
    set({ autoLayoutMode: mode })
  },

  autoArrange: (containerWidth: number, containerHeight: number): CardRect[] => {
    const { panels, autoLayoutMode } = get()
    const cards: CardRect[] = panels
      .filter(p => p.sessionId !== null)
      .map((p) => ({
        id: p.sessionId!,
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

  toggleMaximize: (index: number) => {
    const current = get().maximizedPanelIndex
    set({ maximizedPanelIndex: current === index ? null : index })
  },

  // ボードキャンバス用アクション
  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  updateNodePosition: (sessionId, x, y) => {
    const boardNodes = get().boardNodes.map(n =>
      n.sessionId === sessionId ? { ...n, x, y } : n
    )
    set({ boardNodes })
    persistBoardLayout(boardNodes, get().boardEdges, get().viewport)
  },

  updateNodeSize: (sessionId, width, height) => {
    const boardNodes = get().boardNodes.map(n =>
      n.sessionId === sessionId ? { ...n, width, height } : n
    )
    set({ boardNodes })
    persistBoardLayout(boardNodes, get().boardEdges, get().viewport)
  },

  addBoardNode: (sessionId) => {
    const { boardNodes } = get()
    if (boardNodes.find(n => n.sessionId === sessionId)) return
    const existingCards: CardRect[] = boardNodes.map(n => ({
      id: n.sessionId,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }))
    const pos = findOptimalPosition(
      existingCards,
      { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
      3000,
      3000,
    )
    const newNode: BoardNodePosition = {
      sessionId,
      x: pos.x,
      y: pos.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    }
    const newBoardNodes = [...boardNodes, newNode]
    set({ boardNodes: newBoardNodes, activeSessionId: sessionId })
    persistBoardLayout(newBoardNodes, get().boardEdges, get().viewport)
  },

  removeBoardNode: (sessionId) => {
    const boardNodes = get().boardNodes.filter(n => n.sessionId !== sessionId)
    // 関連エッジも削除
    const boardEdges = get().boardEdges.filter(e => e.source !== sessionId && e.target !== sessionId)
    set({ boardNodes, boardEdges })
    if (get().activeSessionId === sessionId) {
      set({ activeSessionId: null })
    }
    persistBoardLayout(boardNodes, boardEdges, get().viewport)
  },

  setViewport: (viewport) => {
    set({ viewport })
    persistBoardLayout(get().boardNodes, get().boardEdges, viewport)
  },

  setBoardNodes: (nodes) => {
    set({ boardNodes: nodes })
    persistBoardLayout(nodes, get().boardEdges, get().viewport)
  },

  // エッジ（コネクター線）用アクション
  addEdge: (edge) => {
    // 重複チェック（同じソース・ターゲットの接続は許可しない）
    const existing = get().boardEdges.find(
      e => e.source === edge.source && e.target === edge.target
    )
    if (existing) return
    const boardEdges = [...get().boardEdges, edge]
    set({ boardEdges })
    persistBoardLayout(get().boardNodes, boardEdges, get().viewport)
  },

  removeEdge: (edgeId) => {
    const boardEdges = get().boardEdges.filter(e => e.id !== edgeId)
    set({ boardEdges })
    persistBoardLayout(get().boardNodes, boardEdges, get().viewport)
  },

  setBoardEdges: (edges) => {
    set({ boardEdges: edges })
    persistBoardLayout(get().boardNodes, edges, get().viewport)
  },
}))

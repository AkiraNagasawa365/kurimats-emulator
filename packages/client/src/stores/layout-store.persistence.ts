import type {
  BoardEdge,
  BoardLayoutState,
  BoardNodePosition,
  FileTilePosition,
  LayoutPanel,
  LayoutState,
  LayoutMode,
} from '@kurimats/shared'
import { layoutApi } from '../lib/api'

export const STORAGE_KEY = 'kurimats-layout'
export const BOARD_STORAGE_KEY = 'kurimats-board-layout'

export interface StoredViewport {
  x: number
  y: number
  zoom: number
}

export interface StoredBoardState {
  nodes: BoardNodePosition[]
  edges: BoardEdge[]
  fileTiles: FileTilePosition[]
  viewport: StoredViewport
}

let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null
let boardSaveTimer: ReturnType<typeof setTimeout> | null = null
let layoutSaveVersion = 0
let boardSaveVersion = 0

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  return localStorage
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function readSavedLayout(): Partial<LayoutState> | null {
  const saved = safeJsonParse<LayoutState>(getStorage()?.getItem(STORAGE_KEY) ?? null)
  if (!saved) {
    return null
  }

  return {
    mode: saved.mode,
    panels: saved.panels,
    activePanelIndex: saved.activePanelIndex,
  }
}

export function readSavedBoardLayout(): StoredBoardState | null {
  const saved = safeJsonParse<BoardLayoutState>(getStorage()?.getItem(BOARD_STORAGE_KEY) ?? null)
  if (!saved) {
    return null
  }

  return {
    nodes: saved.nodes ?? [],
    edges: saved.edges ?? [],
    fileTiles: saved.fileTiles ?? [],
    viewport: saved.viewport ?? { x: 0, y: 0, zoom: 1 },
  }
}

export function readLayoutSavedAt(): number {
  return safeJsonParse<LayoutState>(getStorage()?.getItem(STORAGE_KEY) ?? null)?.savedAt ?? 0
}

export function readBoardSavedAt(): number {
  return safeJsonParse<BoardLayoutState>(getStorage()?.getItem(BOARD_STORAGE_KEY) ?? null)?.savedAt ?? 0
}

export function persistLayoutState(state: {
  mode: LayoutMode
  panels: LayoutPanel[]
  activePanelIndex: number
}): void {
  const payload: LayoutState = {
    mode: state.mode,
    panels: state.panels,
    activePanelIndex: state.activePanelIndex,
    savedAt: Date.now(),
  }

  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorageが使えない環境では黙って無視する
  }

  layoutSaveVersion += 1
  const currentVersion = layoutSaveVersion

  if (layoutSaveTimer) {
    clearTimeout(layoutSaveTimer)
  }

  layoutSaveTimer = setTimeout(() => {
    void layoutApi.save(payload).catch(() => {
      if (currentVersion !== layoutSaveVersion) {
        return
      }
      // サーバー保存に失敗してもUIは継続する
    })
  }, 1000)
}

export function persistBoardState(state: StoredBoardState): void {
  const payload: BoardLayoutState = {
    nodes: state.nodes,
    edges: state.edges,
    fileTiles: state.fileTiles,
    viewport: state.viewport,
    savedAt: Date.now(),
  }

  try {
    getStorage()?.setItem(BOARD_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorageが使えない環境では黙って無視する
  }

  boardSaveVersion += 1
  const currentVersion = boardSaveVersion

  if (boardSaveTimer) {
    clearTimeout(boardSaveTimer)
  }

  boardSaveTimer = setTimeout(() => {
    void layoutApi.saveBoard(payload).catch(() => {
      if (currentVersion !== boardSaveVersion) {
        return
      }
      // サーバー保存に失敗してもUIは継続する
    })
  }, 1000)
}

export function clearLayoutPersistenceTimers(): void {
  if (layoutSaveTimer) {
    clearTimeout(layoutSaveTimer)
    layoutSaveTimer = null
  }

  if (boardSaveTimer) {
    clearTimeout(boardSaveTimer)
    boardSaveTimer = null
  }
}

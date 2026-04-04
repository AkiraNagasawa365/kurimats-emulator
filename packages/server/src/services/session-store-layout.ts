import type Database from 'better-sqlite3'
import type { BoardLayoutState, LayoutState } from '@kurimats/shared'

interface LayoutRow {
  mode: string
  panels: string
  active_panel_index: number
  saved_at: number
}

interface BoardLayoutRow {
  nodes: string
  edges: string
  viewport_x: number
  viewport_y: number
  viewport_zoom: number
  saved_at: number
}

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function saveLegacyLayout(db: Database.Database, state: LayoutState): void {
  db.prepare(`
    INSERT OR REPLACE INTO layout_state (id, mode, panels, active_panel_index, saved_at)
    VALUES ('default', ?, ?, ?, ?)
  `).run(state.mode, JSON.stringify(state.panels), state.activePanelIndex, state.savedAt)
}

export function loadLegacyLayout(db: Database.Database): LayoutState | null {
  const row = db.prepare('SELECT * FROM layout_state WHERE id = ?').get('default') as LayoutRow | undefined
  if (!row) {
    return null
  }

  return {
    mode: row.mode as LayoutState['mode'],
    panels: safeParseJson(row.panels, []),
    activePanelIndex: row.active_panel_index,
    savedAt: row.saved_at,
  }
}

export function saveBoardLayoutState(db: Database.Database, state: BoardLayoutState): void {
  db.prepare(`
    INSERT OR REPLACE INTO board_layout (id, nodes, edges, viewport_x, viewport_y, viewport_zoom, saved_at)
    VALUES ('default', ?, ?, ?, ?, ?, ?)
  `).run(
    JSON.stringify(state.nodes),
    JSON.stringify(state.edges),
    state.viewport.x,
    state.viewport.y,
    state.viewport.zoom,
    state.savedAt,
  )
}

export function loadBoardLayoutState(db: Database.Database): BoardLayoutState | null {
  const row = db.prepare('SELECT * FROM board_layout WHERE id = ?').get('default') as BoardLayoutRow | undefined
  if (!row) {
    return null
  }

  return {
    nodes: safeParseJson(row.nodes, []),
    edges: safeParseJson(row.edges || '[]', []),
    fileTiles: [],
    viewport: {
      x: row.viewport_x,
      y: row.viewport_y,
      zoom: row.viewport_zoom,
    },
    savedAt: row.saved_at,
  }
}

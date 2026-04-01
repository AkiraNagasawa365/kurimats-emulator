import { create } from 'zustand'
import type { LayoutMode } from '@kurimats/shared'

interface PanelInfo {
  sessionId: string | null
  position: number
}

interface LayoutState {
  mode: LayoutMode
  panels: PanelInfo[]
  activePanelIndex: number

  setMode: (mode: LayoutMode) => void
  assignSession: (panelIndex: number, sessionId: string) => void
  removeSession: (sessionId: string) => void
  setActivePanel: (index: number) => void
  addPanel: (sessionId: string) => void
}

function panelCountForMode(mode: LayoutMode): number {
  switch (mode) {
    case '1x1': return 1
    case '2x1':
    case '1x2': return 2
    case '2x2': return 4
    case '3x1': return 3
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  mode: '1x1',
  panels: [{ sessionId: null, position: 0 }],
  activePanelIndex: 0,

  setMode: (mode) => {
    const count = panelCountForMode(mode)
    const current = get().panels
    const panels: PanelInfo[] = Array.from({ length: count }, (_, i) => ({
      sessionId: current[i]?.sessionId ?? null,
      position: i,
    }))
    set({ mode, panels, activePanelIndex: Math.min(get().activePanelIndex, count - 1) })
  },

  assignSession: (panelIndex, sessionId) => {
    const panels = [...get().panels]
    if (panels[panelIndex]) {
      panels[panelIndex] = { ...panels[panelIndex], sessionId }
    }
    set({ panels })
  },

  removeSession: (sessionId) => {
    const panels = get().panels.map(p =>
      p.sessionId === sessionId ? { ...p, sessionId: null } : p
    )
    set({ panels })
  },

  setActivePanel: (index) => {
    set({ activePanelIndex: index })
  },

  addPanel: (sessionId) => {
    const { panels, mode } = get()
    // 空きパネルを探す
    const emptyIndex = panels.findIndex(p => p.sessionId === null)
    if (emptyIndex >= 0) {
      const newPanels = [...panels]
      newPanels[emptyIndex] = { ...newPanels[emptyIndex], sessionId }
      set({ panels: newPanels, activePanelIndex: emptyIndex })
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
      // 新しいパネルにセッションを割り当て
      const firstEmpty = newPanels.findIndex(p => p.sessionId === null)
      if (firstEmpty >= 0) {
        newPanels[firstEmpty] = { ...newPanels[firstEmpty], sessionId }
      }
      set({ mode: newMode, panels: newPanels, activePanelIndex: firstEmpty >= 0 ? firstEmpty : 0 })
    }
  },
}))

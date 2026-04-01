import { create } from 'zustand'
import type { LayoutMode } from '@kurimats/shared'
import { layoutApi } from '../lib/api'

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
  loadSavedLayout: () => Promise<void>
}

const STORAGE_KEY = 'kurimats-layout'

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

  // localStorageに即座に保存
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutData))
  } catch {
    // localStorage利用不可の場合は無視
  }

  // サーバーへの保存はデバウンス
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    layoutApi.save(layoutData).catch(() => {
      // サーバー保存失敗は無視（localStorageがバックアップ）
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

// 初期状態をlocalStorageから復元
const savedState = loadFromStorage()

export const useLayoutStore = create<LayoutState>((set, get) => ({
  mode: savedState?.mode ?? '1x1',
  panels: savedState?.panels ?? [{ sessionId: null, position: 0 }],
  activePanelIndex: savedState?.activePanelIndex ?? 0,

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
  },

  setActivePanel: (index) => {
    set({ activePanelIndex: index })
    persistLayout({ ...get(), activePanelIndex: index })
  },

  addPanel: (sessionId) => {
    const { panels, mode } = get()
    // 空きパネルを探す
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
      // 新しいパネルにセッションを割り当て
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
        const localSaved = loadFromStorage()
        // サーバーの方が新しい場合はサーバーのデータを使用
        const localSavedAt = localSaved ? (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').savedAt || 0) : 0
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
  },
}))

import { create } from 'zustand'

type OverlayType = 'file-tree' | 'code-viewer' | 'markdown' | 'feedback' | null

interface OverlayState {
  activeOverlay: OverlayType
  overlayProps: Record<string, unknown>
  openOverlay: (type: OverlayType, props?: Record<string, unknown>) => void
  closeOverlay: () => void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  activeOverlay: null,
  overlayProps: {},
  openOverlay: (type, props = {}) => set({ activeOverlay: type, overlayProps: props }),
  closeOverlay: () => set({ activeOverlay: null, overlayProps: {} }),
}))

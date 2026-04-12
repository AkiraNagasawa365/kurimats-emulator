import { create } from 'zustand'
import type { ResourceSnapshot } from '@kurimats/shared'
import { resourcesApi } from '../lib/api'

interface ResourceState {
  snapshot: ResourceSnapshot | null
  loading: boolean
  /** API からスナップショットを取得 */
  fetchSnapshot: () => Promise<void>
  /** WebSocket から受信したスナップショットで更新 */
  updateSnapshot: (snapshot: ResourceSnapshot) => void
}

export const useResourceStore = create<ResourceState>((set) => ({
  snapshot: null,
  loading: false,

  fetchSnapshot: async () => {
    set({ loading: true })
    try {
      const snapshot = await resourcesApi.snapshot()
      set({ snapshot, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  updateSnapshot: (snapshot) => {
    set({ snapshot })
  },
}))

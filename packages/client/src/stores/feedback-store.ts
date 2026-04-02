import { create } from 'zustand'
import type { Feedback, CreateFeedbackParams } from '@kurimats/shared'
import { feedbackApi } from '../lib/api'

interface FeedbackState {
  feedbackList: Feedback[]
  loading: boolean
  error: string | null

  fetchFeedback: () => Promise<void>
  createFeedback: (params: CreateFeedbackParams) => Promise<Feedback>
  deleteFeedback: (id: string) => Promise<void>
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  feedbackList: [],
  loading: false,
  error: null,

  fetchFeedback: async () => {
    set({ loading: true, error: null })
    try {
      const feedbackList = await feedbackApi.list()
      set({ feedbackList, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  createFeedback: async (params) => {
    const feedback = await feedbackApi.create(params)
    set((state) => ({ feedbackList: [feedback, ...state.feedbackList] }))
    return feedback
  },

  deleteFeedback: async (id) => {
    await feedbackApi.delete(id)
    set((state) => ({ feedbackList: state.feedbackList.filter(f => f.id !== id) }))
  },
}))

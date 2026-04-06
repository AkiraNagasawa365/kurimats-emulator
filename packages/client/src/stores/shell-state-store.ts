import { create } from 'zustand'
import type { ShellState } from '@kurimats/shared'

/** 初期シェル状態 */
const initialShellState: ShellState = {
  executionState: 'idle',
  lastExitCode: null,
  lastCommandFinishedAt: null,
}

interface ShellStateStore {
  /** セッションID → シェル状態 */
  states: Map<string, ShellState>
  /** シェル状態を取得（なければ初期状態） */
  getState: (sessionId: string) => ShellState
  /** コマンド実行開始（OSC 133;C） */
  markCommandStart: (sessionId: string) => void
  /** コマンド完了（OSC 133;D） */
  markCommandFinish: (sessionId: string, exitCode: number) => void
  /** セッション削除時のクリーンアップ */
  removeSession: (sessionId: string) => void
}

export const useShellStateStore = create<ShellStateStore>((set, get) => ({
  states: new Map(),

  getState: (sessionId) => {
    return get().states.get(sessionId) ?? initialShellState
  },

  markCommandStart: (sessionId) => {
    set((prev) => {
      const next = new Map(prev.states)
      const current = next.get(sessionId) ?? { ...initialShellState }
      next.set(sessionId, { ...current, executionState: 'executing' })
      return { states: next }
    })
  },

  markCommandFinish: (sessionId, exitCode) => {
    set((prev) => {
      const next = new Map(prev.states)
      next.set(sessionId, {
        executionState: 'idle',
        lastExitCode: exitCode,
        lastCommandFinishedAt: Date.now(),
      })
      return { states: next }
    })
  },

  removeSession: (sessionId) => {
    set((prev) => {
      const next = new Map(prev.states)
      next.delete(sessionId)
      return { states: next }
    })
  },
}))

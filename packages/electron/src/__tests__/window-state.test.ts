import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadWindowState,
  saveWindowState,
  extractWindowState,
  DEFAULT_WINDOW_STATE,
  StateStore,
  WindowState,
} from '../window-state'

/** テスト用のインメモリストア */
class MockStore implements StateStore {
  private data: Record<string, unknown> = {}

  get(key: string): unknown {
    return this.data[key]
  }

  set(key: string, value: unknown): void {
    this.data[key] = value
  }
}

describe('window-state', () => {
  let store: MockStore

  beforeEach(() => {
    store = new MockStore()
  })

  describe('loadWindowState', () => {
    it('ストアが空の場合、デフォルト値を返す', () => {
      const state = loadWindowState(store)
      expect(state).toEqual(DEFAULT_WINDOW_STATE)
    })

    it('保存された値を正しく読み込む', () => {
      const saved: WindowState = {
        x: 100,
        y: 200,
        width: 1200,
        height: 800,
        isMaximized: true,
      }
      store.set('windowState', saved)

      const state = loadWindowState(store)
      expect(state).toEqual(saved)
    })

    it('不正な値が含まれる場合、該当フィールドのみデフォルト値を使用する', () => {
      store.set('windowState', {
        x: 'invalid',
        y: 200,
        width: 100, // 最小幅(400)未満
        height: 800,
        isMaximized: 'not boolean',
      })

      const state = loadWindowState(store)
      expect(state.x).toBe(DEFAULT_WINDOW_STATE.x) // 不正な文字列 → デフォルト
      expect(state.y).toBe(200) // 正常な値 → そのまま
      expect(state.width).toBe(DEFAULT_WINDOW_STATE.width) // 最小未満 → デフォルト
      expect(state.height).toBe(800) // 正常な値 → そのまま
      expect(state.isMaximized).toBe(DEFAULT_WINDOW_STATE.isMaximized) // 不正な型 → デフォルト
    })

    it('nullが保存されている場合、デフォルト値を返す', () => {
      store.set('windowState', null)
      const state = loadWindowState(store)
      expect(state).toEqual(DEFAULT_WINDOW_STATE)
    })

    it('NaNの値はデフォルトにフォールバックする', () => {
      store.set('windowState', {
        x: NaN,
        y: Infinity,
        width: 1000,
        height: 800,
        isMaximized: false,
      })

      const state = loadWindowState(store)
      expect(state.x).toBe(DEFAULT_WINDOW_STATE.x)
      expect(state.y).toBe(DEFAULT_WINDOW_STATE.y)
      expect(state.width).toBe(1000)
    })

    it('部分的なオブジェクトでも正しく処理する', () => {
      store.set('windowState', { width: 1600 })

      const state = loadWindowState(store)
      expect(state.width).toBe(1600)
      expect(state.height).toBe(DEFAULT_WINDOW_STATE.height)
      expect(state.x).toBe(DEFAULT_WINDOW_STATE.x)
    })
  })

  describe('saveWindowState', () => {
    it('ウインドウ状態を正しく保存する', () => {
      const state: WindowState = {
        x: 50,
        y: 75,
        width: 1000,
        height: 700,
        isMaximized: false,
      }

      saveWindowState(store, state)
      expect(store.get('windowState')).toEqual(state)
    })

    it('上書き保存が正しく動作する', () => {
      saveWindowState(store, { x: 0, y: 0, width: 800, height: 600, isMaximized: false })
      saveWindowState(store, { x: 100, y: 100, width: 1200, height: 900, isMaximized: true })

      const saved = store.get('windowState') as WindowState
      expect(saved.x).toBe(100)
      expect(saved.isMaximized).toBe(true)
    })
  })

  describe('extractWindowState', () => {
    it('BrowserWindowライクなオブジェクトから状態を抽出する', () => {
      const mockWindow = {
        getBounds: () => ({ x: 10, y: 20, width: 1400, height: 900 }),
        isMaximized: () => false,
      }

      const state = extractWindowState(mockWindow)
      expect(state).toEqual({
        x: 10,
        y: 20,
        width: 1400,
        height: 900,
        isMaximized: false,
      })
    })

    it('最大化状態を正しく抽出する', () => {
      const mockWindow = {
        getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
        isMaximized: () => true,
      }

      const state = extractWindowState(mockWindow)
      expect(state.isMaximized).toBe(true)
    })
  })

  describe('DEFAULT_WINDOW_STATE', () => {
    it('適切なデフォルト値が設定されている', () => {
      expect(DEFAULT_WINDOW_STATE.width).toBeGreaterThanOrEqual(800)
      expect(DEFAULT_WINDOW_STATE.height).toBeGreaterThanOrEqual(600)
      expect(DEFAULT_WINDOW_STATE.isMaximized).toBe(false)
    })
  })
})

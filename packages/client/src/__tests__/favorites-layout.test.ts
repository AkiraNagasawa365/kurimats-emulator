import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../stores/layout-store'

describe('お気に入りレイアウト切替', () => {
  beforeEach(() => {
    const store = useLayoutStore.getState()
    // 初期状態にリセット
    useLayoutStore.setState({
      mode: '2x2',
      panels: [
        { sessionId: 'a', position: 0 },
        { sessionId: 'b', position: 1 },
        { sessionId: 'c', position: 2 },
        { sessionId: 'd', position: 3 },
      ],
      activePanelIndex: 0,
      savedLayoutBeforeFavorites: null,
      boardNodes: [
        { sessionId: 'a', x: 0, y: 0, width: 520, height: 620 },
        { sessionId: 'b', x: 600, y: 0, width: 520, height: 620 },
        { sessionId: 'c', x: 0, y: 700, width: 520, height: 620 },
        { sessionId: 'd', x: 600, y: 700, width: 520, height: 620 },
      ],
    })
  })

  it('showFavoritesOnly でお気に入りセッションだけのレイアウトに切り替わる', () => {
    useLayoutStore.getState().showFavoritesOnly(['a', 'c'])

    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x1')
    expect(state.panels).toHaveLength(2)
    expect(state.panels[0].sessionId).toBe('a')
    expect(state.panels[1].sessionId).toBe('c')
    expect(state.activePanelIndex).toBe(0)
  })

  it('元のレイアウトが退避される', () => {
    useLayoutStore.getState().showFavoritesOnly(['a', 'c'])

    const saved = useLayoutStore.getState().savedLayoutBeforeFavorites
    expect(saved).not.toBeNull()
    expect(saved!.mode).toBe('2x2')
    expect(saved!.panels).toHaveLength(4)
    expect(saved!.panels[0].sessionId).toBe('a')
    expect(saved!.panels[3].sessionId).toBe('d')
  })

  it('restoreFromFavorites で元のレイアウトに復元される', () => {
    useLayoutStore.getState().showFavoritesOnly(['a', 'c'])
    useLayoutStore.getState().restoreFromFavorites()

    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x2')
    expect(state.panels).toHaveLength(4)
    expect(state.panels[0].sessionId).toBe('a')
    expect(state.panels[3].sessionId).toBe('d')
    expect(state.savedLayoutBeforeFavorites).toBeNull()
  })

  it('お気に入り1件なら1x1モードになる', () => {
    useLayoutStore.getState().showFavoritesOnly(['b'])

    const state = useLayoutStore.getState()
    expect(state.mode).toBe('1x1')
    expect(state.panels).toHaveLength(1)
    expect(state.panels[0].sessionId).toBe('b')
  })

  it('お気に入り3件なら2x2モードになる（4パネルのうち3つ使用）', () => {
    useLayoutStore.getState().showFavoritesOnly(['a', 'b', 'c'])

    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x2')
    expect(state.panels).toHaveLength(4)
    expect(state.panels[0].sessionId).toBe('a')
    expect(state.panels[1].sessionId).toBe('b')
    expect(state.panels[2].sessionId).toBe('c')
    expect(state.panels[3].sessionId).toBeNull()
  })

  it('お気に入り0件では何も起こらない', () => {
    useLayoutStore.getState().showFavoritesOnly([])

    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x2')
    expect(state.savedLayoutBeforeFavorites).toBeNull()
  })

  it('退避データがない状態で restoreFromFavorites しても安全', () => {
    useLayoutStore.getState().restoreFromFavorites()

    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x2')
    expect(state.panels).toHaveLength(4)
  })
})

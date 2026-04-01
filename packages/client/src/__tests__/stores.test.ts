import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../stores/layout-store'

describe('レイアウトストア', () => {
  beforeEach(() => {
    // ストアをリセット
    useLayoutStore.setState({
      mode: '1x1',
      panels: [{ sessionId: null, position: 0 }],
      activePanelIndex: 0,
    })
  })

  it('初期状態は1x1', () => {
    const state = useLayoutStore.getState()
    expect(state.mode).toBe('1x1')
    expect(state.panels).toHaveLength(1)
  })

  it('2x1に切り替えるとパネルが2つになる', () => {
    useLayoutStore.getState().setMode('2x1')
    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x1')
    expect(state.panels).toHaveLength(2)
  })

  it('2x2に切り替えるとパネルが4つになる', () => {
    useLayoutStore.getState().setMode('2x2')
    const state = useLayoutStore.getState()
    expect(state.mode).toBe('2x2')
    expect(state.panels).toHaveLength(4)
  })

  it('パネルにセッションを割り当てできる', () => {
    useLayoutStore.getState().setMode('2x1')
    useLayoutStore.getState().assignSession(0, 'session-1')
    useLayoutStore.getState().assignSession(1, 'session-2')
    const state = useLayoutStore.getState()
    expect(state.panels[0].sessionId).toBe('session-1')
    expect(state.panels[1].sessionId).toBe('session-2')
  })

  it('セッションを除去できる', () => {
    useLayoutStore.getState().setMode('2x1')
    useLayoutStore.getState().assignSession(0, 'session-1')
    useLayoutStore.getState().removeSession('session-1')
    expect(useLayoutStore.getState().panels[0].sessionId).toBeNull()
  })

  it('addPanelで空きパネルに割り当てる', () => {
    useLayoutStore.getState().setMode('2x1')
    useLayoutStore.getState().assignSession(0, 'existing')
    useLayoutStore.getState().addPanel('new-session')
    const state = useLayoutStore.getState()
    expect(state.panels[1].sessionId).toBe('new-session')
  })
})

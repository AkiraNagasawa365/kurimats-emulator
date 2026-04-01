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

describe('自動レイアウト拡張', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      mode: '1x1',
      panels: [{ sessionId: null, position: 0 }],
      activePanelIndex: 0,
      autoLayoutMode: 'grid',
      maximizedPanelIndex: null,
    })
  })

  it('autoLayoutModeの初期値はgrid', () => {
    expect(useLayoutStore.getState().autoLayoutMode).toBe('grid')
  })

  it('autoLayoutModeをflowに切り替えられる', () => {
    useLayoutStore.getState().setAutoLayoutMode('flow')
    expect(useLayoutStore.getState().autoLayoutMode).toBe('flow')
  })

  it('autoLayoutModeをtreeに切り替えられる', () => {
    useLayoutStore.getState().setAutoLayoutMode('tree')
    expect(useLayoutStore.getState().autoLayoutMode).toBe('tree')
  })

  it('maximizedPanelIndexの初期値はnull', () => {
    expect(useLayoutStore.getState().maximizedPanelIndex).toBeNull()
  })

  it('toggleMaximizeでパネルを最大化できる', () => {
    useLayoutStore.getState().toggleMaximize(0)
    expect(useLayoutStore.getState().maximizedPanelIndex).toBe(0)
  })

  it('toggleMaximizeで同じパネルを再度トグルすると元に戻る', () => {
    useLayoutStore.getState().toggleMaximize(0)
    useLayoutStore.getState().toggleMaximize(0)
    expect(useLayoutStore.getState().maximizedPanelIndex).toBeNull()
  })

  it('toggleMaximizeで異なるパネルに切り替えられる', () => {
    useLayoutStore.getState().setMode('2x1')
    useLayoutStore.getState().toggleMaximize(0)
    useLayoutStore.getState().toggleMaximize(1)
    expect(useLayoutStore.getState().maximizedPanelIndex).toBe(1)
  })

  it('autoArrangeがCardRect配列を返す', () => {
    useLayoutStore.getState().setMode('2x1')
    useLayoutStore.getState().assignSession(0, 'session-1')
    useLayoutStore.getState().assignSession(1, 'session-2')
    const result = useLayoutStore.getState().autoArrange(800, 600)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('session-1')
    expect(result[1].id).toBe('session-2')
  })
})

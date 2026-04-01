import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../stores/layout-store'

describe('ボードキャンバスストア', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      mode: '1x1',
      panels: [{ sessionId: null, position: 0 }],
      activePanelIndex: 0,
      autoLayoutMode: 'grid',
      maximizedPanelIndex: null,
      boardNodes: [],
      activeSessionId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
    })
  })

  it('boardNodesの初期値は空配列', () => {
    expect(useLayoutStore.getState().boardNodes).toEqual([])
  })

  it('activeSessionIdの初期値はnull', () => {
    expect(useLayoutStore.getState().activeSessionId).toBeNull()
  })

  it('viewportの初期値はデフォルト値', () => {
    const viewport = useLayoutStore.getState().viewport
    expect(viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('addBoardNodeでボードノードを追加できる', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    const state = useLayoutStore.getState()
    expect(state.boardNodes).toHaveLength(1)
    expect(state.boardNodes[0].sessionId).toBe('session-1')
    expect(state.boardNodes[0].width).toBe(600)
    expect(state.boardNodes[0].height).toBe(400)
    expect(state.activeSessionId).toBe('session-1')
  })

  it('同じセッションIDのノードは重複追加されない', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    useLayoutStore.getState().addBoardNode('session-1')
    expect(useLayoutStore.getState().boardNodes).toHaveLength(1)
  })

  it('複数ノードを追加すると重ならない位置に配置される', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    useLayoutStore.getState().addBoardNode('session-2')
    useLayoutStore.getState().addBoardNode('session-3')
    const nodes = useLayoutStore.getState().boardNodes
    expect(nodes).toHaveLength(3)

    // 各ノードの位置が異なることを確認
    const positions = nodes.map(n => `${n.x},${n.y}`)
    const uniquePositions = new Set(positions)
    expect(uniquePositions.size).toBe(3)
  })

  it('removeBoardNodeでノードを削除できる', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    useLayoutStore.getState().addBoardNode('session-2')
    useLayoutStore.getState().removeBoardNode('session-1')
    const state = useLayoutStore.getState()
    expect(state.boardNodes).toHaveLength(1)
    expect(state.boardNodes[0].sessionId).toBe('session-2')
  })

  it('removeBoardNodeでアクティブセッションが削除されるとnullになる', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    useLayoutStore.getState().setActiveSession('session-1')
    useLayoutStore.getState().removeBoardNode('session-1')
    expect(useLayoutStore.getState().activeSessionId).toBeNull()
  })

  it('updateNodePositionでノードの位置を更新できる', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    useLayoutStore.getState().updateNodePosition('session-1', 100, 200)
    const node = useLayoutStore.getState().boardNodes[0]
    expect(node.x).toBe(100)
    expect(node.y).toBe(200)
  })

  it('updateNodeSizeでノードのサイズを更新できる', () => {
    useLayoutStore.getState().addBoardNode('session-1')
    useLayoutStore.getState().updateNodeSize('session-1', 800, 500)
    const node = useLayoutStore.getState().boardNodes[0]
    expect(node.width).toBe(800)
    expect(node.height).toBe(500)
  })

  it('setActiveSessionでアクティブセッションを設定できる', () => {
    useLayoutStore.getState().setActiveSession('session-1')
    expect(useLayoutStore.getState().activeSessionId).toBe('session-1')
  })

  it('setActiveSessionでnullを設定できる', () => {
    useLayoutStore.getState().setActiveSession('session-1')
    useLayoutStore.getState().setActiveSession(null)
    expect(useLayoutStore.getState().activeSessionId).toBeNull()
  })

  it('setViewportでビューポートを更新できる', () => {
    useLayoutStore.getState().setViewport({ x: 100, y: 200, zoom: 1.5 })
    expect(useLayoutStore.getState().viewport).toEqual({ x: 100, y: 200, zoom: 1.5 })
  })

  it('setBoardNodesでノード一覧を一括設定できる', () => {
    const nodes = [
      { sessionId: 'a', x: 0, y: 0, width: 600, height: 400 },
      { sessionId: 'b', x: 700, y: 0, width: 600, height: 400 },
    ]
    useLayoutStore.getState().setBoardNodes(nodes)
    expect(useLayoutStore.getState().boardNodes).toEqual(nodes)
  })

  it('addPanelでボードノードも同時に追加される', () => {
    useLayoutStore.getState().addPanel('session-1')
    expect(useLayoutStore.getState().boardNodes).toHaveLength(1)
    expect(useLayoutStore.getState().boardNodes[0].sessionId).toBe('session-1')
  })

  it('removeSessionでボードノードも同時に削除される', () => {
    useLayoutStore.getState().addPanel('session-1')
    useLayoutStore.getState().removeSession('session-1')
    expect(useLayoutStore.getState().boardNodes).toHaveLength(0)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../stores/layout-store'

/**
 * Phase 1: ファイルタイル（Monaco Editor）のストアテスト
 */
describe('ファイルタイル管理', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      mode: '1x1',
      panels: [{ sessionId: null, position: 0 }],
      activePanelIndex: 0,
      autoLayoutMode: 'grid',
      maximizedPanelIndex: null,
      boardNodes: [],
      boardEdges: [],
      fileTiles: [],
      activeSessionId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
    })
  })

  it('fileTilesの初期値は空配列', () => {
    expect(useLayoutStore.getState().fileTiles).toEqual([])
  })

  it('addFileTileでファイルタイルを追加できる', () => {
    useLayoutStore.getState().addFileTile('/path/to/file.ts', 'typescript')
    const tiles = useLayoutStore.getState().fileTiles
    expect(tiles).toHaveLength(1)
    expect(tiles[0].filePath).toBe('/path/to/file.ts')
    expect(tiles[0].language).toBe('typescript')
    expect(tiles[0].width).toBe(500)
    expect(tiles[0].height).toBe(400)
    expect(tiles[0].id).toMatch(/^file-/)
  })

  it('同じファイルパスのタイルは重複追加されない', () => {
    useLayoutStore.getState().addFileTile('/path/to/file.ts', 'typescript')
    useLayoutStore.getState().addFileTile('/path/to/file.ts', 'typescript')
    expect(useLayoutStore.getState().fileTiles).toHaveLength(1)
  })

  it('異なるファイルは追加できる', () => {
    useLayoutStore.getState().addFileTile('/path/to/a.ts', 'typescript')
    useLayoutStore.getState().addFileTile('/path/to/b.ts', 'typescript')
    expect(useLayoutStore.getState().fileTiles).toHaveLength(2)
  })

  it('removeFileTileでタイルを削除できる', () => {
    useLayoutStore.getState().addFileTile('/path/to/a.ts', 'typescript')
    useLayoutStore.getState().addFileTile('/path/to/b.ts', 'typescript')
    const tileId = useLayoutStore.getState().fileTiles[0].id
    useLayoutStore.getState().removeFileTile(tileId)
    const tiles = useLayoutStore.getState().fileTiles
    expect(tiles).toHaveLength(1)
    expect(tiles[0].filePath).toBe('/path/to/b.ts')
  })

  it('updateFileTilePositionで位置を更新できる', () => {
    useLayoutStore.getState().addFileTile('/path/to/file.ts', 'typescript')
    const tileId = useLayoutStore.getState().fileTiles[0].id
    useLayoutStore.getState().updateFileTilePosition(tileId, 200, 300)
    const tile = useLayoutStore.getState().fileTiles[0]
    expect(tile.x).toBe(200)
    expect(tile.y).toBe(300)
  })

  it('updateFileTileSizeでサイズを更新できる', () => {
    useLayoutStore.getState().addFileTile('/path/to/file.ts', 'typescript')
    const tileId = useLayoutStore.getState().fileTiles[0].id
    useLayoutStore.getState().updateFileTileSize(tileId, 800, 600)
    const tile = useLayoutStore.getState().fileTiles[0]
    expect(tile.width).toBe(800)
    expect(tile.height).toBe(600)
  })

  it('ファイルタイルはセッションノードと重ならない位置に配置される', () => {
    // セッションノードを追加
    useLayoutStore.getState().addBoardNode('session-1')
    // ファイルタイルを追加
    useLayoutStore.getState().addFileTile('/path/to/file.ts', 'typescript')

    const sessionNode = useLayoutStore.getState().boardNodes[0]
    const fileTile = useLayoutStore.getState().fileTiles[0]

    // 重なっていないことを確認
    const noOverlap =
      fileTile.x + fileTile.width <= sessionNode.x ||
      fileTile.x >= sessionNode.x + sessionNode.width ||
      fileTile.y + fileTile.height <= sessionNode.y ||
      fileTile.y >= sessionNode.y + sessionNode.height
    expect(noOverlap).toBe(true)
  })
})

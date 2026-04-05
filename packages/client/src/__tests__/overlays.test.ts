import { describe, it, expect, beforeEach } from 'vitest'
import { useOverlayStore } from '../stores/overlay-store'
import { useCommandPaletteStore } from '../stores/command-palette-store'

describe('オーバーレイストア', () => {
  beforeEach(() => {
    useOverlayStore.setState({ activeOverlay: null, overlayProps: {} })
  })

  it('初期状態ではオーバーレイなし', () => {
    const state = useOverlayStore.getState()
    expect(state.activeOverlay).toBeNull()
    expect(state.overlayProps).toEqual({})
  })

  it('ファイルツリーオーバーレイを開ける', () => {
    useOverlayStore.getState().openOverlay('file-tree')
    const state = useOverlayStore.getState()
    expect(state.activeOverlay).toBe('file-tree')
  })

  it('コードビューアをprops付きで開ける', () => {
    useOverlayStore.getState().openOverlay('code-viewer', { filePath: '/test/file.ts' })
    const state = useOverlayStore.getState()
    expect(state.activeOverlay).toBe('code-viewer')
    expect(state.overlayProps.filePath).toBe('/test/file.ts')
  })

  it('Markdownオーバーレイを開ける', () => {
    useOverlayStore.getState().openOverlay('markdown')
    expect(useOverlayStore.getState().activeOverlay).toBe('markdown')
  })

  it('オーバーレイを閉じるとnullに戻る', () => {
    useOverlayStore.getState().openOverlay('file-tree')
    useOverlayStore.getState().closeOverlay()
    const state = useOverlayStore.getState()
    expect(state.activeOverlay).toBeNull()
    expect(state.overlayProps).toEqual({})
  })

  it('別のオーバーレイに切り替えできる', () => {
    useOverlayStore.getState().openOverlay('file-tree')
    useOverlayStore.getState().openOverlay('markdown')
    expect(useOverlayStore.getState().activeOverlay).toBe('markdown')
  })
})

describe('オーバーレイ切替（キーボードショートカット相当）', () => {
  beforeEach(() => {
    useOverlayStore.setState({ activeOverlay: null, overlayProps: {} })
  })

  it('ファイルツリーをトグルで開閉できる', () => {
    const store = useOverlayStore.getState()
    // 開く
    store.openOverlay('file-tree')
    expect(useOverlayStore.getState().activeOverlay).toBe('file-tree')
    // 同じタイプなら閉じる（トグル動作）
    const current = useOverlayStore.getState()
    if (current.activeOverlay === 'file-tree') {
      current.closeOverlay()
    }
    expect(useOverlayStore.getState().activeOverlay).toBeNull()
  })

  it('Markdownをトグルで開閉できる', () => {
    const store = useOverlayStore.getState()
    store.openOverlay('markdown')
    expect(useOverlayStore.getState().activeOverlay).toBe('markdown')
    const current = useOverlayStore.getState()
    if (current.activeOverlay === 'markdown') {
      current.closeOverlay()
    }
    expect(useOverlayStore.getState().activeOverlay).toBeNull()
  })

  it('ファイルツリーからMarkdownへの切り替えでpropsも更新される', () => {
    useOverlayStore.getState().openOverlay('file-tree', { sessionId: 'sess-1' })
    expect(useOverlayStore.getState().overlayProps).toEqual({ sessionId: 'sess-1' })
    useOverlayStore.getState().openOverlay('markdown', { filePath: '/test.md', fullScreen: true })
    expect(useOverlayStore.getState().activeOverlay).toBe('markdown')
    expect(useOverlayStore.getState().overlayProps).toEqual({ filePath: '/test.md', fullScreen: true })
  })

  it('コードビューアをファイルパス付きで開ける', () => {
    useOverlayStore.getState().openOverlay('code-viewer', { filePath: '/src/index.ts' })
    const state = useOverlayStore.getState()
    expect(state.activeOverlay).toBe('code-viewer')
    expect(state.overlayProps.filePath).toBe('/src/index.ts')
  })
})

describe('コマンドパレットストア', () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({ isOpen: false, search: '' })
  })

  it('初期状態では閉じている', () => {
    const state = useCommandPaletteStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.search).toBe('')
  })

  it('openで開いてsearchがリセットされる', () => {
    useCommandPaletteStore.getState().setSearch('テスト')
    useCommandPaletteStore.getState().open()
    const state = useCommandPaletteStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.search).toBe('')
  })

  it('closeで閉じてsearchがリセットされる', () => {
    useCommandPaletteStore.getState().open()
    useCommandPaletteStore.getState().setSearch('検索語')
    useCommandPaletteStore.getState().close()
    const state = useCommandPaletteStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.search).toBe('')
  })

  it('検索テキストを設定できる', () => {
    useCommandPaletteStore.getState().setSearch('レイアウト')
    expect(useCommandPaletteStore.getState().search).toBe('レイアウト')
  })
})

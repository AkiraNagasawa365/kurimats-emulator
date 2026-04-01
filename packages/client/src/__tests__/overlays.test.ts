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

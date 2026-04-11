import { describe, it, expect, vi, beforeEach } from 'vitest'

// zustand ストアをモック化し、React ツリーに載せずに OverlayRenderer を
// 純粋関数として呼び出せるようにする（jsdom/DOM 非依存）
const mockState = {
  activeOverlay: null as string | null,
  overlayProps: {} as Record<string, unknown>,
  closeOverlay: vi.fn(),
  openOverlay: vi.fn(),
}
vi.mock('../stores/overlay-store', () => ({
  useOverlayStore: () => mockState,
}))

// 各オーバーレイ子コンポーネントは型比較で判定するため実装を空に差し替える
vi.mock('../components/overlays/FileTreeOverlay', () => ({
  FileTreeOverlay: () => null,
}))
vi.mock('../components/overlays/MarkdownOverlay', () => ({
  MarkdownOverlay: () => null,
}))
vi.mock('../components/overlays/CodeViewerOverlay', () => ({
  CodeViewerOverlay: () => null,
}))
vi.mock('../components/feedback/FeedbackPanel', () => ({
  FeedbackPanel: () => null,
}))

import { OverlayRenderer } from '../components/overlays/OverlayRenderer'
import { FileTreeOverlay } from '../components/overlays/FileTreeOverlay'
import { MarkdownOverlay } from '../components/overlays/MarkdownOverlay'
import { CodeViewerOverlay } from '../components/overlays/CodeViewerOverlay'
import { FeedbackPanel } from '../components/feedback/FeedbackPanel'

describe('OverlayRenderer の分岐', () => {
  beforeEach(() => {
    mockState.activeOverlay = null
    mockState.overlayProps = {}
  })

  it('activeOverlayがnullなら何も返さない', () => {
    const element = OverlayRenderer()
    expect(element).toBeNull()
  })

  it('file-treeでFileTreeOverlayを返す', () => {
    mockState.activeOverlay = 'file-tree'
    const element = OverlayRenderer() as { type: unknown } | null
    expect(element?.type).toBe(FileTreeOverlay)
  })

  it('markdownでMarkdownOverlayを返す', () => {
    mockState.activeOverlay = 'markdown'
    const element = OverlayRenderer() as { type: unknown } | null
    expect(element?.type).toBe(MarkdownOverlay)
  })

  it('code-viewerでCodeViewerOverlayを返す', () => {
    mockState.activeOverlay = 'code-viewer'
    mockState.overlayProps = { filePath: '/a.ts' }
    const element = OverlayRenderer() as { type: unknown } | null
    expect(element?.type).toBe(CodeViewerOverlay)
  })

  // リグレッションガード: #153 フィードバックボタンが反応しない問題
  // OverlayRenderer の switch に 'feedback' ケースが無いと FeedbackPanel が描画されず無反応になる
  it('feedbackでFeedbackPanelを返す', () => {
    mockState.activeOverlay = 'feedback'
    const element = OverlayRenderer() as { type: unknown } | null
    expect(element?.type).toBe(FeedbackPanel)
  })
})

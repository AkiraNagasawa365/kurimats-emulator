/**
 * PaneToolbar のユニットテスト
 *
 * 本プロジェクトは jsdom@29 × Node 24 の組合せで
 * vitest の jsdom 環境が `ERR_REQUIRE_ASYNC_MODULE` により
 * 起動できない既知問題を抱えている（Issue別途起票）。
 * そのため DOM に依存せず、react-dom/server の
 * renderToStaticMarkup で HTML 文字列化して検証する。
 * クリック配線の検証は Playwright E2E 側に委譲する。
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaneToolbar } from '../components/panes/PaneToolbar'
import type { Session } from '@kurimats/shared'

// AnimatedFavoriteButton を軽量な span モックに差し替える
vi.mock('../components/animations/FavoriteAnimations', () => ({
  AnimatedFavoriteButton: ({ isFavorite }: { isFavorite: boolean; onToggle: () => void }) => (
    <span data-testid="favorite-button">{isFavorite ? '★' : '☆'}</span>
  ),
}))

const mockTogglePin = vi.fn()
const mockOpenOverlay = vi.fn()

vi.mock('../stores/workspace-store', () => ({
  useWorkspaceStore: (selector: any) => selector({
    activeWorkspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', isPinned: false }],
    togglePin: mockTogglePin,
  }),
}))

vi.mock('../stores/pane-store', () => ({
  usePaneStore: (selector: any) => selector({
    addSurface: vi.fn(),
  }),
}))

vi.mock('../stores/overlay-store', () => ({
  useOverlayStore: (selector: any) => selector({
    openOverlay: mockOpenOverlay,
  }),
}))

const baseSession: Session = {
  id: 'session-1',
  name: 'テストセッション',
  repoPath: '/test/repo',
  worktreePath: '/test/worktree',
  branch: 'feat/test',
  status: 'active',
  claudeSessionId: null,
  isFavorite: false,
  projectId: null,
  sshHost: null,
  isRemote: false,
  workspaceId: null,
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
}

/** テスト対象を server render し HTML 文字列を返す */
function renderHtml(props: { session: Session; paneId?: string; isActive?: boolean }) {
  return renderToStaticMarkup(
    <PaneToolbar session={props.session} paneId={props.paneId ?? 'pane-1'} isActive={props.isActive} />,
  )
}

describe('PaneToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('セッション名とブランチ名を表示する', () => {
    const html = renderHtml({ session: baseSession })
    expect(html).toContain('テストセッション')
    expect(html).toContain('[feat/test]')
  })

  it('ブランチがnullの場合はブランチ表示を省略する', () => {
    const session = { ...baseSession, branch: null }
    const html = renderHtml({ session })
    expect(html).toContain('テストセッション')
    expect(html).not.toMatch(/\[[^\]]*\]/)
  })

  it('activeセッションは緑インジケータを表示する', () => {
    const html = renderHtml({ session: baseSession })
    expect(html).toContain('bg-green-500')
  })

  it('非activeセッションはグレーインジケータを表示する', () => {
    const session = { ...baseSession, status: 'paused' as const }
    const html = renderHtml({ session })
    expect(html).toContain('bg-gray-400')
  })

  it('isActive=true の場合はツールバー背景を bg-surface-2 + border-b-accent に切り替える', () => {
    const html = renderHtml({ session: baseSession, isActive: true })
    expect(html).toContain('bg-surface-2')
    expect(html).toContain('border-b-accent')
    expect(html).not.toContain('bg-surface-1')
  })

  it('isActive=false（デフォルト）の場合は bg-surface-1 + border-b-border-light を使う', () => {
    const html = renderHtml({ session: baseSession })
    expect(html).toContain('bg-surface-1')
    expect(html).toContain('border-b-border-light')
    expect(html).not.toContain('bg-surface-2')
  })

  it('ツールバー背景はペイン content bg (bg-surface-0) と同じトークンを使わない', () => {
    const htmlInactive = renderHtml({ session: baseSession })
    const htmlActive = renderHtml({ session: baseSession, isActive: true })
    expect(htmlInactive).not.toMatch(/\bbg-surface-0\b/)
    expect(htmlActive).not.toMatch(/\bbg-surface-0\b/)
  })

  it('下辺は 2px の border-b-2 で分離線を確保する', () => {
    const htmlInactive = renderHtml({ session: baseSession })
    const htmlActive = renderHtml({ session: baseSession, isActive: true })
    expect(htmlInactive).toContain('border-b-2')
    expect(htmlActive).toContain('border-b-2')
  })

  it('ペイン境界強調のため border-x を常時付与する', () => {
    const htmlInactive = renderHtml({ session: baseSession })
    const htmlActive = renderHtml({ session: baseSession, isActive: true })
    expect(htmlInactive).toContain('border-x')
    expect(htmlActive).toContain('border-x')
  })

  it('data-testid="pane-toolbar" を公開してテストから参照可能にする', () => {
    const html = renderHtml({ session: baseSession })
    expect(html).toContain('data-testid="pane-toolbar"')
  })

  it('★はワークスペースのピン状態を反映する（未ピン → ☆）', () => {
    const html = renderHtml({ session: baseSession })
    expect(html).toContain('☆')
  })

  describe('ファイルツリー起動ボタン（📁）', () => {
    it('📁ボタンが描画され data-testid と title を公開する', () => {
      const html = renderHtml({ session: baseSession })
      expect(html).toContain('data-testid="file-tree-button"')
      expect(html).toContain('title="ファイルツリーを開く"')
      expect(html).toContain('aria-label="ファイルツリーを開く"')
      expect(html).toContain('📁')
    })

    it('📁ボタンは常時視認できる色（text-transparent を使わない）', () => {
      const html = renderHtml({ session: baseSession })
      const tagMatch = html.match(/<button[^>]*data-testid="file-tree-button"[^>]*>/)
      expect(tagMatch).toBeTruthy()
      const buttonTag = tagMatch?.[0] ?? ''
      expect(buttonTag).toContain('text-text-muted')
      expect(buttonTag).not.toContain('text-transparent')
    })

    it('📁ボタンは右寄せボタン群の中で★より左に配置される', () => {
      const html = renderHtml({ session: baseSession })
      const fileTreePos = html.indexOf('data-testid="file-tree-button"')
      const favoritePos = html.indexOf('data-testid="favorite-button"')
      expect(fileTreePos).toBeGreaterThan(0)
      expect(favoritePos).toBeGreaterThan(0)
      expect(fileTreePos).toBeLessThan(favoritePos)
    })
  })
})

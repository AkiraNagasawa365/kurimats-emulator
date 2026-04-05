/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PaneToolbar } from '../components/panes/PaneToolbar'
import type { Session } from '@kurimats/shared'

// AnimatedFavoriteButtonモック
vi.mock('../components/animations/FavoriteAnimations', () => ({
  AnimatedFavoriteButton: ({ isFavorite, onToggle }: { isFavorite: boolean; onToggle: () => void }) => (
    <span data-testid="favorite-button" onClick={onToggle}>
      {isFavorite ? '★' : '☆'}
    </span>
  ),
}))

// モックストア
const mockToggleFavorite = vi.fn()
const mockAddSurface = vi.fn()

vi.mock('../stores/session-store', () => ({
  useSessionStore: (selector: any) => selector({
    toggleFavorite: mockToggleFavorite,
  }),
}))

vi.mock('../stores/pane-store', () => ({
  usePaneStore: (selector: any) => selector({
    addSurface: mockAddSurface,
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

describe('PaneToolbar', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('セッション名とブランチ名を表示する', () => {
    render(<PaneToolbar session={baseSession} paneId="pane-1" />)
    expect(screen.getByText('テストセッション')).toBeTruthy()
    expect(screen.getByText('[feat/test]')).toBeTruthy()
  })

  it('ブランチがnullの場合はブランチ表示を省略する', () => {
    const session = { ...baseSession, branch: null }
    render(<PaneToolbar session={session} paneId="pane-1" />)
    expect(screen.getByText('テストセッション')).toBeTruthy()
    expect(screen.queryByText(/\[/)).toBeNull()
  })

  it('お気に入りボタンクリックでtoggleFavoriteが呼ばれる', () => {
    render(<PaneToolbar session={baseSession} paneId="pane-1" />)
    const favButton = screen.getByTestId('favorite-button')
    fireEvent.click(favButton)
    expect(mockToggleFavorite).toHaveBeenCalledWith('session-1')
  })

  it('activeセッションは緑インジケータを表示する', () => {
    const { container } = render(<PaneToolbar session={baseSession} paneId="pane-1" />)
    const indicator = container.querySelector('.bg-green-500')
    expect(indicator).toBeTruthy()
  })

  it('非activeセッションはグレーインジケータを表示する', () => {
    const session = { ...baseSession, status: 'paused' as const }
    const { container } = render(<PaneToolbar session={session} paneId="pane-1" />)
    const indicator = container.querySelector('.bg-gray-400')
    expect(indicator).toBeTruthy()
  })
})

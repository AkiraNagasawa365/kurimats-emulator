import { describe, it, expect } from 'vitest'
import { matchesCanvasFilter } from '@kurimats/shared'
import type { CanvasFilterCriteria } from '@kurimats/shared'

/**
 * Phase 4: キャンバスフィルタ機能のテスト（共通フィルタ関数使用）
 */
describe('キャンバスフィルタ（matchesCanvasFilter）', () => {
  it('デフォルトフィルタは全セッションにマッチ', () => {
    const filter: CanvasFilterCriteria = { favoritesOnly: false, status: 'all', projectId: null }
    expect(matchesCanvasFilter({ isFavorite: false, status: 'active', projectId: null }, filter)).toBe(true)
    expect(matchesCanvasFilter({ isFavorite: true, status: 'disconnected', projectId: 'p1' }, filter)).toBe(true)
  })

  it('お気に入りフィルタでお気に入り以外を除外', () => {
    const filter: CanvasFilterCriteria = { favoritesOnly: true, status: 'all', projectId: null }
    expect(matchesCanvasFilter({ isFavorite: true, status: 'active', projectId: null }, filter)).toBe(true)
    expect(matchesCanvasFilter({ isFavorite: false, status: 'active', projectId: null }, filter)).toBe(false)
  })

  it('ステータスフィルタで特定ステータスのみマッチ', () => {
    const filter: CanvasFilterCriteria = { favoritesOnly: false, status: 'active', projectId: null }
    expect(matchesCanvasFilter({ isFavorite: false, status: 'active', projectId: null }, filter)).toBe(true)
    expect(matchesCanvasFilter({ isFavorite: false, status: 'disconnected', projectId: null }, filter)).toBe(false)
  })

  it('プロジェクトフィルタで特定プロジェクトのみマッチ', () => {
    const filter: CanvasFilterCriteria = { favoritesOnly: false, status: 'all', projectId: 'p1' }
    expect(matchesCanvasFilter({ isFavorite: false, status: 'active', projectId: 'p1' }, filter)).toBe(true)
    expect(matchesCanvasFilter({ isFavorite: false, status: 'active', projectId: 'p2' }, filter)).toBe(false)
  })

  it('複合フィルタが正しく動作', () => {
    const filter: CanvasFilterCriteria = { favoritesOnly: true, status: 'active', projectId: 'p1' }
    expect(matchesCanvasFilter({ isFavorite: true, status: 'active', projectId: 'p1' }, filter)).toBe(true)
    expect(matchesCanvasFilter({ isFavorite: true, status: 'disconnected', projectId: 'p1' }, filter)).toBe(false)
    expect(matchesCanvasFilter({ isFavorite: false, status: 'active', projectId: 'p1' }, filter)).toBe(false)
    expect(matchesCanvasFilter({ isFavorite: true, status: 'active', projectId: 'p2' }, filter)).toBe(false)
  })
})

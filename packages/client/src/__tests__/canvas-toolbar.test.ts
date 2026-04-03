import { describe, it, expect } from 'vitest'
import type { CanvasFilter } from '../components/board/CanvasToolbar'

/**
 * Phase 4: キャンバスツールバー + フィルタ機能のテスト
 */
describe('キャンバスフィルタ', () => {
  // フィルタのデフォルト値テスト
  it('デフォルトフィルタはすべて非アクティブ', () => {
    const defaultFilter: CanvasFilter = {
      favoritesOnly: false,
      status: 'all',
      projectId: null,
    }
    expect(defaultFilter.favoritesOnly).toBe(false)
    expect(defaultFilter.status).toBe('all')
    expect(defaultFilter.projectId).toBeNull()
  })

  // フィルタ適用ロジックのテスト
  it('お気に入りフィルタでお気に入り以外を除外', () => {
    const sessions = [
      { id: '1', isFavorite: true, status: 'active', projectId: null },
      { id: '2', isFavorite: false, status: 'active', projectId: null },
      { id: '3', isFavorite: true, status: 'disconnected', projectId: 'p1' },
    ]
    const filter: CanvasFilter = { favoritesOnly: true, status: 'all', projectId: null }
    const filtered = sessions.filter(s => {
      if (filter.favoritesOnly && !s.isFavorite) return false
      if (filter.status !== 'all' && s.status !== filter.status) return false
      if (filter.projectId && s.projectId !== filter.projectId) return false
      return true
    })
    expect(filtered).toHaveLength(2)
    expect(filtered.every(s => s.isFavorite)).toBe(true)
  })

  it('ステータスフィルタで特定ステータスのみ表示', () => {
    const sessions = [
      { id: '1', isFavorite: false, status: 'active', projectId: null },
      { id: '2', isFavorite: false, status: 'disconnected', projectId: null },
      { id: '3', isFavorite: false, status: 'active', projectId: null },
    ]
    const filter: CanvasFilter = { favoritesOnly: false, status: 'active', projectId: null }
    const filtered = sessions.filter(s => {
      if (filter.favoritesOnly && !s.isFavorite) return false
      if (filter.status !== 'all' && s.status !== filter.status) return false
      if (filter.projectId && s.projectId !== filter.projectId) return false
      return true
    })
    expect(filtered).toHaveLength(2)
    expect(filtered.every(s => s.status === 'active')).toBe(true)
  })

  it('プロジェクトフィルタで特定プロジェクトのみ表示', () => {
    const sessions = [
      { id: '1', isFavorite: false, status: 'active', projectId: 'p1' },
      { id: '2', isFavorite: false, status: 'active', projectId: 'p2' },
      { id: '3', isFavorite: false, status: 'active', projectId: 'p1' },
    ]
    const filter: CanvasFilter = { favoritesOnly: false, status: 'all', projectId: 'p1' }
    const filtered = sessions.filter(s => {
      if (filter.favoritesOnly && !s.isFavorite) return false
      if (filter.status !== 'all' && s.status !== filter.status) return false
      if (filter.projectId && s.projectId !== filter.projectId) return false
      return true
    })
    expect(filtered).toHaveLength(2)
    expect(filtered.every(s => s.projectId === 'p1')).toBe(true)
  })

  it('複合フィルタが正しく動作する', () => {
    const sessions = [
      { id: '1', isFavorite: true, status: 'active', projectId: 'p1' },
      { id: '2', isFavorite: true, status: 'disconnected', projectId: 'p1' },
      { id: '3', isFavorite: false, status: 'active', projectId: 'p1' },
      { id: '4', isFavorite: true, status: 'active', projectId: 'p2' },
    ]
    const filter: CanvasFilter = { favoritesOnly: true, status: 'active', projectId: 'p1' }
    const filtered = sessions.filter(s => {
      if (filter.favoritesOnly && !s.isFavorite) return false
      if (filter.status !== 'all' && s.status !== filter.status) return false
      if (filter.projectId && s.projectId !== filter.projectId) return false
      return true
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('1')
  })
})

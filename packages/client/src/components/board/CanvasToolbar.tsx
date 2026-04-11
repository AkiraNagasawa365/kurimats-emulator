import { useState } from 'react'
import type { Project, CanvasFilterCriteria } from '@kurimats/shared'

/** キャンバスフィルタ状態（sharedの型を再エクスポート） */
export type CanvasFilter = CanvasFilterCriteria

interface Props {
  filter: CanvasFilter
  onFilterChange: (filter: CanvasFilter) => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onFitView: () => void
  onAutoLayout: () => void
  projects: Project[]
  sessionCount: number
  fileTileCount: number
}

/**
 * キャンバスフローティングツールバー
 * フィルタ、ズーム操作、整列機能を提供
 */
export function CanvasToolbar({
  filter,
  onFilterChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFitView,
  onAutoLayout,
  projects,
  sessionCount,
  fileTileCount,
}: Props) {
  const [showFilters, setShowFilters] = useState(false)
  const isFiltered = filter.favoritesOnly || filter.status !== 'all' || filter.projectId !== null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-chrome/90 backdrop-blur-sm border border-border rounded-lg px-2 py-1.5 shadow-lg">
      {/* フィルタボタン */}
      <div className="relative">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-2 py-1 text-[11px] rounded transition-colors ${
            isFiltered
              ? 'bg-accent/20 text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
          }`}
          title="フィルタ"
        >
          {isFiltered ? '● フィルタ' : 'フィルタ'}
        </button>

        {/* フィルタドロップダウン */}
        {showFilters && (
          <div className="absolute top-full left-0 mt-1 bg-chrome border border-border rounded-lg shadow-xl p-3 min-w-[200px] space-y-3">
            {/* お気に入りフィルタ */}
            <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={filter.favoritesOnly}
                onChange={e => onFilterChange({ ...filter, favoritesOnly: e.target.checked })}
                className="rounded accent-accent"
              />
              ★ お気に入りのみ
            </label>

            {/* ステータスフィルタ */}
            <div>
              <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">ステータス</label>
              <select
                value={filter.status}
                onChange={e => onFilterChange({ ...filter, status: e.target.value as CanvasFilter['status'] })}
                className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded text-text-primary outline-none focus:border-accent"
              >
                <option value="all">すべて</option>
                <option value="active">アクティブ</option>
                <option value="disconnected">切断済み</option>
                <option value="terminated">終了済み</option>
              </select>
            </div>

            {/* プロジェクトフィルタ */}
            <div>
              <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">プロジェクト</label>
              <select
                value={filter.projectId || ''}
                onChange={e => onFilterChange({ ...filter, projectId: e.target.value || null })}
                className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded text-text-primary outline-none focus:border-accent"
              >
                <option value="">すべて</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* フィルタクリア */}
            {isFiltered && (
              <button
                onClick={() => onFilterChange({ favoritesOnly: false, status: 'all', projectId: null })}
                className="w-full px-2 py-1 text-[11px] text-text-muted hover:text-text-primary bg-surface-2 hover:bg-surface-3 rounded transition-colors"
              >
                フィルタをクリア
              </button>
            )}
          </div>
        )}
      </div>

      {/* セパレーター */}
      <div className="w-px h-4 bg-border" />

      {/* ズーム操作 */}
      <button
        onClick={onZoomOut}
        className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors text-xs"
        title="ズームアウト (⌘-)"
      >
        −
      </button>
      <button
        onClick={onZoomReset}
        className="px-1.5 py-0.5 text-[10px] font-mono text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors min-w-[36px] text-center"
        title="ズームリセット (⌘0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={onZoomIn}
        className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors text-xs"
        title="ズームイン (⌘+)"
      >
        +
      </button>

      {/* セパレーター */}
      <div className="w-px h-4 bg-border" />

      {/* フィットビュー */}
      <button
        onClick={onFitView}
        className="px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
        title="全体表示"
      >
        全体
      </button>

      {/* 整列 */}
      <button
        onClick={onAutoLayout}
        className="px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
        title="ノード整列"
      >
        整列
      </button>

      {/* セパレーター */}
      <div className="w-px h-4 bg-border" />

      {/* カウンター */}
      <span className="text-[10px] text-text-muted px-1">
        {sessionCount}セッション{fileTileCount > 0 ? ` / ${fileTileCount}ファイル` : ''}
      </span>
    </div>
  )
}

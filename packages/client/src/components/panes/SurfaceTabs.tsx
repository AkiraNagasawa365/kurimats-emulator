import type { Surface } from '@kurimats/shared'
import { usePaneStore } from '../../stores/pane-store'

interface SurfaceTabsProps {
  paneId: string
  surfaces: Surface[]
  activeSurfaceIndex: number
}

const SURFACE_ICONS: Record<Surface['type'], string> = {
  terminal: '>_',
  browser: '🌐',
  editor: '📝',
  markdown: '📄',
}

/**
 * ペイン内の水平タブバー
 * 各サーフェス（terminal/browser/editor/markdown）をタブで切替
 */
export function SurfaceTabs({ paneId, surfaces, activeSurfaceIndex }: SurfaceTabsProps) {
  const switchSurface = usePaneStore(s => s.switchSurface)
  const removeSurface = usePaneStore(s => s.removeSurface)

  if (surfaces.length <= 1) return null // タブが1つ以下なら非表示

  return (
    <div className="flex items-center gap-0.5 bg-surface-1 border-b border-border px-1 h-7 flex-shrink-0 overflow-x-auto">
      {surfaces.map((surface, index) => (
        <button
          key={surface.id}
          className={`
            flex items-center gap-1 px-2 py-0.5 text-xs rounded-t
            transition-colors whitespace-nowrap
            ${index === activeSurfaceIndex
              ? 'bg-surface-0 text-text-primary border-t border-x border-border'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            }
          `}
          onClick={() => switchSurface(paneId, index)}
        >
          <span className="opacity-60">{SURFACE_ICONS[surface.type]}</span>
          <span className="max-w-24 truncate">{surface.label}</span>
          {surfaces.length > 1 && (
            <span
              className="ml-1 opacity-40 hover:opacity-100 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                removeSurface(paneId, surface.id)
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

import { useCallback, useEffect, useRef } from 'react'
import type { LayoutMode, AutoLayoutMode } from '@kurimats/shared'
import { useLayoutStore } from '../../stores/layout-store'
import { useSessionStore } from '../../stores/session-store'
import { TerminalComponent } from '../terminal/Terminal'
import { TerminalHeader } from '../terminal/TerminalHeader'

const AUTO_LAYOUT_OPTIONS: { mode: AutoLayoutMode; label: string }[] = [
  { mode: 'grid', label: 'グリッド' },
  { mode: 'flow', label: 'フロー' },
  { mode: 'tree', label: 'ツリー' },
]

/**
 * パネルグリッドコンテナ
 * レイアウトモードに応じてターミナルパネルをグリッド表示
 */
export function PanelContainer() {
  const {
    mode,
    panels,
    activePanelIndex,
    setActivePanel,
    removeSession,
    autoLayoutMode,
    setAutoLayoutMode,
    maximizedPanelIndex,
    toggleMaximize,
  } = useLayoutStore()
  const { sessions, deleteSession } = useSessionStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const gridClass = getGridClass(mode)

  // ウィンドウリサイズ時にコンテナサイズを検知
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      // リサイズ検知時に再レンダリングをトリガー（将来的にカードサイズ自動調整に使用）
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ダブルクリックで最大化/元に戻す
  const handleDoubleClick = useCallback(
    (index: number) => {
      toggleMaximize(index)
    },
    [toggleMaximize],
  )

  // 最大化時は1パネルのみ表示
  const isMaximized = maximizedPanelIndex !== null
  const visiblePanels = isMaximized
    ? [{ panel: panels[maximizedPanelIndex!], index: maximizedPanelIndex! }]
    : panels.map((panel, index) => ({ panel, index }))

  return (
    <div className="flex flex-col h-full">
      {/* 自動整列ボタン */}
      <div className="flex items-center gap-1 px-2 py-1 bg-chrome border-b border-border">
        <span className="text-xs text-text-muted mr-1">配置:</span>
        {AUTO_LAYOUT_OPTIONS.map(({ mode: layoutMode, label }) => (
          <button
            key={layoutMode}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              autoLayoutMode === layoutMode
                ? 'bg-accent text-surface-0'
                : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
            }`}
            onClick={() => setAutoLayoutMode(layoutMode)}
            title={`${label}配置に切り替え`}
          >
            {label}
          </button>
        ))}
        {isMaximized && (
          <button
            className="ml-auto px-2 py-0.5 text-xs rounded bg-surface-2 text-text-secondary hover:bg-surface-3"
            onClick={() => toggleMaximize(maximizedPanelIndex!)}
            title="最大化を解除"
          >
            元に戻す
          </button>
        )}
      </div>

      {/* パネルグリッド */}
      <div
        ref={containerRef}
        className={`grid gap-0 flex-1 min-h-0 ${isMaximized ? 'grid-cols-1 grid-rows-1' : gridClass}`}
      >
        {visiblePanels.map(({ panel, index }) => {
          const session = sessions.find(s => s.id === panel.sessionId)
          const isActive = index === activePanelIndex

          return (
            <div
              key={index}
              className={`flex flex-col min-h-0 min-w-0 border ${
                isActive ? 'border-accent' : 'border-border'
              }`}
              onClick={() => setActivePanel(index)}
              onDoubleClick={() => handleDoubleClick(index)}
            >
              {session ? (
                <>
                  <TerminalHeader
                    session={session}
                    isActive={isActive}
                    onClose={() => {
                      deleteSession(session.id)
                      removeSession(session.id)
                    }}
                  />
                  <div className="flex-1 min-h-0">
                    <TerminalComponent
                      sessionId={session.id}
                      isActive={isActive}
                      onFocus={() => setActivePanel(index)}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-surface-0 text-text-muted">
                  <div className="text-center">
                    <p className="text-sm">空のパネル</p>
                    <p className="text-xs mt-1 text-text-muted">サイドバーからセッションを作成</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getGridClass(mode: LayoutMode): string {
  switch (mode) {
    case '1x1': return 'grid-cols-1 grid-rows-1'
    case '2x1': return 'grid-cols-2 grid-rows-1'
    case '1x2': return 'grid-cols-1 grid-rows-2'
    case '2x2': return 'grid-cols-2 grid-rows-2'
    case '3x1': return 'grid-cols-3 grid-rows-1'
  }
}

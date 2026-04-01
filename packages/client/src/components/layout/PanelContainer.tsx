import type { LayoutMode } from '@kurimats/shared'
import { useLayoutStore } from '../../stores/layout-store'
import { useSessionStore } from '../../stores/session-store'
import { TerminalComponent } from '../terminal/Terminal'
import { TerminalHeader } from '../terminal/TerminalHeader'

/**
 * パネルグリッドコンテナ
 * レイアウトモードに応じてターミナルパネルをグリッド表示
 */
export function PanelContainer() {
  const { mode, panels, activePanelIndex, setActivePanel, removeSession } = useLayoutStore()
  const { sessions, deleteSession } = useSessionStore()

  const gridClass = getGridClass(mode)

  return (
    <div className={`grid gap-0 h-full ${gridClass}`}>
      {panels.map((panel, index) => {
        const session = sessions.find(s => s.id === panel.sessionId)
        const isActive = index === activePanelIndex

        return (
          <div
            key={index}
            className={`flex flex-col min-h-0 min-w-0 border ${
              isActive ? 'border-accent' : 'border-border'
            }`}
            onClick={() => setActivePanel(index)}
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
              <div className="flex-1 flex items-center justify-center bg-white text-text-muted">
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

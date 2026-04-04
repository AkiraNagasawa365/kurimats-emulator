import { useEffect, useState } from 'react'
import { ActivityBar, type ActivityBarSection } from './components/navigator/ActivityBar'
import { WorkspaceNavigator } from './components/navigator/WorkspaceNavigator'
import { PaneContainer } from './components/panes/PaneContainer'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { NotificationToast } from './components/notifications/NotificationToast'
import { useSessionStore } from './stores/session-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useCommandPaletteStore } from './stores/command-palette-store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useNotificationWs } from './hooks/useNotificationWs'

export default function App() {
  const { fetchSessions, fetchProjects } = useSessionStore()
  const { fetchWorkspaces, workspaces } = useWorkspaceStore()
  const { isOpen: isPaletteOpen } = useCommandPaletteStore()
  const [activeSection, setActiveSection] = useState<ActivityBarSection | null>('workspaces')

  useKeyboardShortcuts()
  useNotificationWs()

  useEffect(() => {
    fetchSessions()
    fetchProjects()
    fetchWorkspaces()
  }, [fetchSessions, fetchProjects, fetchWorkspaces])

  // 通知バッジの合計
  const totalNotifications = workspaces.reduce((sum, w) => sum + w.notificationCount, 0)

  const handleSectionToggle = (section: ActivityBarSection) => {
    setActiveSection(prev => prev === section ? null : section)
  }

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-text-primary">
      {/* メインエリア: ActivityBar + Navigator + PaneContainer */}
      <div className="flex-1 flex min-h-0">
        {/* 左端アイコンバー（48px） */}
        <ActivityBar
          activeSection={activeSection}
          onSectionToggle={handleSectionToggle}
          totalNotifications={totalNotifications}
        />

        {/* 展開可能サイドパネル */}
        {activeSection && activeSection !== 'settings' && (
          <WorkspaceNavigator activeSection={activeSection} />
        )}

        {/* ペイン分割エリア */}
        <PaneContainer />
      </div>

      {/* ステータスバー */}
      <StatusBar />

      {/* コマンドパレット */}
      {isPaletteOpen && <CommandPalette />}

      {/* 通知トースト */}
      <NotificationToast />
    </div>
  )
}

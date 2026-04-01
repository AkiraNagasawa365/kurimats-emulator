import { useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { PanelContainer } from './components/layout/PanelContainer'
import { StatusBar } from './components/layout/StatusBar'
import { useSessionStore } from './stores/session-store'

export default function App() {
  const { fetchSessions } = useSessionStore()

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-white">
      {/* メインエリア: サイドバー + パネル */}
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <PanelContainer />
        </div>
      </div>

      {/* ステータスバー */}
      <StatusBar />
    </div>
  )
}

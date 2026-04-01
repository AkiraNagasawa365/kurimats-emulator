import { useSessionStore } from '../../stores/session-store'
import { useLayoutStore } from '../../stores/layout-store'

/**
 * 画面下部のステータスバー
 */
export function StatusBar() {
  const { sessions } = useSessionStore()
  const { mode } = useLayoutStore()
  const activeSessions = sessions.filter(s => s.status === 'active')

  return (
    <div className="h-6 bg-accent flex items-center px-3 text-[11px] text-white/90 gap-4">
      <span>Kurimats Emulator</span>
      <span>セッション: {activeSessions.length}</span>
      <span>レイアウト: {mode}</span>
      <div className="flex-1" />
      <span>Ctrl+E: ファイル | Ctrl+M: MD | Ctrl+P: 検索</span>
    </div>
  )
}

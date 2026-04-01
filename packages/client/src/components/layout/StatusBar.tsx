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
    <div className="h-7 bg-white border-t border-border flex items-center px-3 text-[11px] text-text-secondary gap-4">
      <span className="font-medium text-text-primary">Kurimats Emulator</span>
      <span>セッション: {activeSessions.length}/{sessions.length}</span>
      <span>レイアウト: {mode}</span>
      <div className="flex-1" />
      <span className="text-text-muted">
        <kbd className="px-1 py-0.5 bg-surface-2 rounded text-[10px]">⌘⇧P</kbd> コマンド
        <span className="mx-1.5">|</span>
        <kbd className="px-1 py-0.5 bg-surface-2 rounded text-[10px]">⌘E</kbd> ファイル
        <span className="mx-1.5">|</span>
        <kbd className="px-1 py-0.5 bg-surface-2 rounded text-[10px]">⌘M</kbd> MD
      </span>
    </div>
  )
}

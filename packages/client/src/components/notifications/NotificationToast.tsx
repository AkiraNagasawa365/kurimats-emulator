import { useSshStore } from '../../stores/ssh-store'

/**
 * 通知トーストエリア
 * Claude通知やSSH接続状態をトースト形式で表示する
 */
export function NotificationToast() {
  const { notifications, markNotificationRead, clearNotifications } = useSshStore()

  // 未読通知のみ表示
  const unread = notifications.filter(n => !n.read)

  if (unread.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {/* クリアボタン */}
      {unread.length > 1 && (
        <button
          onClick={clearNotifications}
          className="self-end text-[10px] text-text-muted hover:text-text-secondary px-2 py-0.5 bg-surface-1 rounded border border-border transition-colors"
        >
          全て閉じる
        </button>
      )}

      {unread.slice(0, 5).map(notification => (
        <div
          key={notification.id}
          className="bg-surface-1 border border-accent/30 rounded-lg shadow-lg p-3 flex items-start gap-2 animate-slide-in"
        >
          <span className="text-accent text-sm flex-shrink-0 mt-0.5">●</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-primary font-medium truncate">
              Claude通知
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
              {notification.message}
            </p>
            <p className="text-[9px] text-text-muted mt-1">
              {new Date(notification.timestamp).toLocaleTimeString('ja-JP')}
            </p>
          </div>
          <button
            onClick={() => markNotificationRead(notification.id)}
            className="text-text-muted hover:text-text-primary text-xs px-1 flex-shrink-0"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

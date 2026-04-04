import { useCallback, useEffect, useState } from 'react'
import { TerminalComponent } from '../terminal/Terminal'
import { usePaneStore } from '../../stores/pane-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { sessionsApi } from '../../lib/api'

interface TerminalSurfaceProps {
  sessionId: string
  paneId: string
}

/**
 * ターミナルサーフェス
 * 既存のTerminalComponentをペインシステム向けにラップする
 * disconnectedセッションは自動再接続を試みる
 */
export function TerminalSurface({ sessionId, paneId }: TerminalSurfaceProps) {
  const focusPane = usePaneStore(s => s.focusPane)
  const activeWorkspace = useWorkspaceStore(s =>
    s.workspaces.find(w => w.id === s.activeWorkspaceId),
  )
  const [ready, setReady] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActive = activeWorkspace?.activePaneId === paneId

  // マウント時にセッション状態を確認し、disconnectedなら再接続
  useEffect(() => {
    let cancelled = false
    async function checkAndReconnect() {
      try {
        const session = await sessionsApi.get(sessionId)
        if (cancelled) return

        if (session.status === 'disconnected') {
          setReconnecting(true)
          try {
            await sessionsApi.reconnect(sessionId)
            if (!cancelled) {
              setReady(true)
              setReconnecting(false)
            }
          } catch (e) {
            if (!cancelled) {
              setError(`再接続失敗: ${e}`)
              setReconnecting(false)
            }
          }
        } else {
          setReady(true)
        }
      } catch {
        // セッションが見つからない場合
        if (!cancelled) setError('セッションが見つかりません')
      }
    }
    checkAndReconnect()
    return () => { cancelled = true }
  }, [sessionId])

  const handleFocus = useCallback(() => {
    focusPane(paneId)
  }, [paneId, focusPane])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    )
  }

  if (reconnecting) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
        再接続中...
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
        接続中...
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <TerminalComponent
        sessionId={sessionId}
        isActive={isActive}
        onFocus={handleFocus}
      />
    </div>
  )
}

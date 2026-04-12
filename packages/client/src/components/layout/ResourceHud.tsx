import { useEffect } from 'react'
import { useResourceStore } from '../../stores/resource-store'

/** バイトを人間が読みやすい形式に変換 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

/** 秒を uptime 表記に変換 */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

/**
 * ステータスバー内に表示するコンパクトなリソース HUD
 * WebSocket でリアルタイム更新、初回は API からフェッチ
 */
export function ResourceHud() {
  const snapshot = useResourceStore(s => s.snapshot)
  const fetchSnapshot = useResourceStore(s => s.fetchSnapshot)

  useEffect(() => {
    fetchSnapshot()
  }, [fetchSnapshot])

  if (!snapshot?.server) return null

  const { server, instances, wsConnectionCount } = snapshot
  const aliveCount = instances.filter(i => i.processStatus === 'alive').length

  return (
    <div className="flex items-center gap-2 text-[10px] text-text-muted">
      {/* サーバー CPU */}
      <span title={`サーバー CPU: ${server.cpuPercent?.toFixed(1) ?? '?'}%`}>
        CPU {server.cpuPercent?.toFixed(0) ?? '?'}%
      </span>

      {/* サーバーメモリ */}
      <span title={`サーバー RSS: ${formatBytes(server.memoryRss)}`}>
        MEM {formatBytes(server.memoryRss)}
      </span>

      {/* アクティブインスタンス数 */}
      {instances.length > 0 && (
        <span title={`${aliveCount}/${instances.length} インスタンス稼働中`}>
          {aliveCount}/{instances.length} inst
        </span>
      )}

      {/* WS 接続数 */}
      <span title={`WebSocket 接続: ${wsConnectionCount}`}>
        WS {wsConnectionCount}
      </span>

      {/* Uptime */}
      <span title={`サーバー稼働時間: ${formatUptime(server.uptime)}`}>
        {formatUptime(server.uptime)}
      </span>
    </div>
  )
}

import { useWorkspaceStore } from '../../stores/workspace-store'
import { countLeaves } from '../../lib/pane-tree-utils'
import { ResourceHud } from './ResourceHud'

/**
 * 画面下部のステータスバー（cmux v3）
 */
export function StatusBar() {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
  const paneCount = activeWs ? countLeaves(activeWs.paneTree) : 0

  return (
    <div className="h-7 bg-chrome border-t border-border flex items-center px-3 text-[11px] text-text-secondary gap-4">
      {/* アクティブワークスペース名 */}
      {activeWs ? (
        <>
          <span className="font-medium text-text-primary">{activeWs.name}</span>
          {activeWs.sshHost && (
            <span className="text-blue-400">SSH: {activeWs.sshHost}</span>
          )}
          <span>{paneCount} ペイン</span>
        </>
      ) : (
        <span className="font-medium text-text-primary">Kurimats Emulator</span>
      )}

      <span>{workspaces.length} ワークスペース</span>

      <div className="flex-1" />

      {/* リソース HUD */}
      <ResourceHud />

      <span className="text-text-muted mx-1">|</span>

      {/* キーボードショートカットヒント */}
      <span className="text-text-muted">
        <kbd className="px-1 py-0.5 bg-surface-2 rounded text-[10px]">⌘⇧P</kbd> コマンド
        <span className="mx-1.5">|</span>
        <kbd className="px-1 py-0.5 bg-surface-2 rounded text-[10px]">⌘D</kbd> 分割
        <span className="mx-1.5">|</span>
        <kbd className="px-1 py-0.5 bg-surface-2 rounded text-[10px]">⌘⇧↩</kbd> ズーム
      </span>
    </div>
  )
}

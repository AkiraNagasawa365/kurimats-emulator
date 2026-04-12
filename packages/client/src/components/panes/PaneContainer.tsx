import { useWorkspaceStore } from '../../stores/workspace-store'
import { usePaneStore } from '../../stores/pane-store'
import { PaneRenderer } from './PaneRenderer'
import { findNode } from '../../lib/pane-tree-utils'
import { PaneLeafView } from './PaneLeafView'
import type { PaneLeaf } from '@kurimats/shared'

/**
 * ペインコンテナ（メインエリアのルート）
 * アクティブワークスペースのペインツリーをレンダリングする
 * ズーム時はフルスクリーンオーバーレイを表示
 */
export function PaneContainer() {
  const activeWorkspace = useWorkspaceStore(s => {
    return s.workspaces.find(w => w.id === s.activeWorkspaceId) ?? null
  })
  const zoomedPaneId = usePaneStore(s => s.zoomedPaneId)
  const unzoom = usePaneStore(s => s.unzoom)

  // ワークスペースがない場合の空状態
  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-0 text-text-muted">
        <div className="text-center">
          <p className="text-lg mb-2">ワークスペースがありません</p>
          <p className="text-sm">Cmd+N で新規作成、または左のナビゲーターから作成</p>
        </div>
      </div>
    )
  }

  const { paneTree } = activeWorkspace

  // ズームオーバーレイ
  if (zoomedPaneId) {
    const zoomedNode = findNode(paneTree, zoomedPaneId)
    if (zoomedNode && zoomedNode.kind === 'leaf') {
      return (
        <div className="flex-1 relative">
          {/* 背景（元のツリーは非表示） */}
          <div className="w-full h-full opacity-10 pointer-events-none">
            <PaneRenderer key={activeWorkspace.id} node={paneTree} />
          </div>
          {/* ズームオーバーレイ */}
          <div className="absolute inset-0 z-50 bg-surface-0">
            <PaneLeafView key={`${activeWorkspace.id}-zoom`} leaf={zoomedNode as PaneLeaf} />
          </div>
          {/* アンズームボタン */}
          <button
            className="absolute top-2 right-2 z-50 px-2 py-1 bg-surface-2 text-text-secondary
                       rounded text-xs hover:bg-surface-3 transition-colors"
            onClick={unzoom}
          >
            Esc でアンズーム
          </button>
        </div>
      )
    }
  }

  return (
    <div className="flex-1 overflow-hidden">
      <PaneRenderer key={activeWorkspace.id} node={paneTree} />
    </div>
  )
}

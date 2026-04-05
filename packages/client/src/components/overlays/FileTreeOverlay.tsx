import { useState, useEffect, useCallback } from 'react'
import type { FileNode } from '@kurimats/shared'
import { filesApi } from '../../lib/api'
import { useOverlayStore } from '../../stores/overlay-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { OverlayContainer } from './OverlayContainer'

interface Props {
  onClose: () => void
}

/**
 * ファイルツリーオーバーレイ
 * リポジトリのファイル構造を表示
 */
export function FileTreeOverlay({ onClose }: Props) {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const { openOverlay } = useOverlayStore()
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [workingDir, setWorkingDir] = useState('')

  // アクティブワークスペースのrepoPathを使用
  useEffect(() => {
    const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
    const root = activeWs?.repoPath || ''
    setWorkingDir(root)

    if (!root) {
      setLoading(false)
      setError('セッションが選択されていません')
      return
    }

    setLoading(true)
    setError(null)
    filesApi.tree(root)
      .then(nodes => {
        setTree(nodes)
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [workspaces, activeWorkspaceId])

  const handleFileClick = useCallback((path: string) => {
    if (path.endsWith('.md')) {
      // Markdownファイルなら全画面markdownオーバーレイ
      openOverlay('markdown', { filePath: path, fullScreen: true })
    } else {
      // コードビューアオーバーレイで開く
      openOverlay('code-viewer', { filePath: path })
    }
  }, [openOverlay])

  return (
    <OverlayContainer isOpen={true} onClose={onClose} title="ファイルツリー">
      <div className="flex flex-col h-full">
        {/* 作業ディレクトリ表示 */}
        {workingDir && (
          <div className="px-4 py-2 text-xs text-text-muted bg-surface-1 border-b border-border truncate">
            {workingDir}
          </div>
        )}

        {/* フィルター入力 */}
        <div className="px-4 py-2 border-b border-border">
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="ファイルを検索..."
            className="w-full px-3 py-1.5 text-sm bg-surface-1 border border-border rounded text-text-primary placeholder-text-muted outline-none focus:border-accent"
            autoFocus
          />
        </div>

        {/* ツリー表示 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-text-muted text-sm">
              読み込み中...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-8 text-red-500 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && tree.length === 0 && (
            <div className="flex items-center justify-center py-8 text-text-muted text-sm">
              ファイルがありません
            </div>
          )}
          {!loading && !error && tree.map(node => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              filter={filter}
              onFileClick={handleFileClick}
            />
          ))}
        </div>
      </div>
    </OverlayContainer>
  )
}

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  filter: string
  onFileClick: (path: string) => void
}

function FileTreeNode({ node, depth, filter, onFileClick }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1)

  // フィルター適用
  const matchesFilter = !filter.trim() || node.name.toLowerCase().includes(filter.toLowerCase())
  const hasMatchingChildren = node.children?.some(child =>
    matchesFilter || child.name.toLowerCase().includes(filter.toLowerCase()) ||
    (child.isDirectory && hasDescendantMatch(child, filter))
  )

  if (!matchesFilter && !hasMatchingChildren && !node.isDirectory) return null
  if (node.isDirectory && !matchesFilter && !hasMatchingChildren) return null

  const paddingLeft = depth * 16 + 8

  if (node.isDirectory) {
    return (
      <>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm text-text-primary hover:bg-surface-2 rounded transition-colors"
          style={{ paddingLeft }}
        >
          <span className="text-xs text-text-muted w-4 text-center flex-shrink-0">
            {expanded ? '▼' : '▶'}
          </span>
          <span className="text-text-secondary">📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map(child => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            filter={filter}
            onFileClick={onFileClick}
          />
        ))}
      </>
    )
  }

  return (
    <button
      onClick={() => onFileClick(node.path)}
      className="w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm text-text-primary hover:bg-surface-2 rounded transition-colors"
      style={{ paddingLeft: paddingLeft + 16 }}
    >
      <span className="text-text-secondary">📄</span>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

function hasDescendantMatch(node: FileNode, filter: string): boolean {
  if (!filter.trim()) return true
  const query = filter.toLowerCase()
  if (node.name.toLowerCase().includes(query)) return true
  return node.children?.some(child => hasDescendantMatch(child, query)) ?? false
}

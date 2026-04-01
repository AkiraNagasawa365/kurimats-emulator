import { useState } from 'react'
import type { LayoutMode } from '@kurimats/shared'
import { useSessionStore } from '../../stores/session-store'
import { useLayoutStore } from '../../stores/layout-store'

const LAYOUT_OPTIONS: { mode: LayoutMode; label: string; icon: string }[] = [
  { mode: '1x1', label: '1列', icon: '▣' },
  { mode: '2x1', label: '2列', icon: '▥' },
  { mode: '1x2', label: '2段', icon: '▤' },
  { mode: '2x2', label: '4分割', icon: '⊞' },
  { mode: '3x1', label: '3列', icon: '⫼' },
]

/**
 * サイドバー
 * セッション一覧、新規作成、レイアウト変更
 */
export function Sidebar() {
  const { sessions, createSession } = useSessionStore()
  const { mode, setMode, addPanel, setActivePanel, panels } = useLayoutStore()
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRepoPath, setNewRepoPath] = useState('')

  const handleCreate = async () => {
    if (!newName.trim() || !newRepoPath.trim()) return

    try {
      const session = await createSession({
        name: newName.trim(),
        repoPath: newRepoPath.trim(),
      })
      addPanel(session.id)
      setNewName('')
      setNewRepoPath('')
      setShowNewForm(false)
    } catch (e) {
      alert(`作成エラー: ${e}`)
    }
  }

  return (
    <div className="w-56 bg-surface-1 border-r border-border flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-bold text-gray-300">Kurimats</h1>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="text-lg text-gray-400 hover:text-white leading-none"
          title="新規セッション"
        >
          +
        </button>
      </div>

      {/* 新規セッション作成フォーム */}
      {showNewForm && (
        <div className="p-2 border-b border-border space-y-2">
          <input
            type="text"
            placeholder="セッション名"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded text-white placeholder-gray-500 focus:border-accent outline-none"
            autoFocus
          />
          <input
            type="text"
            placeholder="リポジトリパス"
            value={newRepoPath}
            onChange={e => setNewRepoPath(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded text-white placeholder-gray-500 focus:border-accent outline-none"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="w-full px-2 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
          >
            作成
          </button>
        </div>
      )}

      {/* セッション一覧 */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-500 text-center">
            セッションなし
          </p>
        ) : (
          sessions.map(session => {
            const panelIndex = panels.findIndex(p => p.sessionId === session.id)
            const isInPanel = panelIndex >= 0

            return (
              <button
                key={session.id}
                onClick={() => {
                  if (isInPanel) {
                    setActivePanel(panelIndex)
                  } else {
                    addPanel(session.id)
                  }
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-surface-2 transition-colors ${
                  isInPanel ? 'text-white' : 'text-gray-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  session.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <span className="truncate">{session.name}</span>
              </button>
            )
          })
        )}
      </div>

      {/* レイアウト切り替え */}
      <div className="px-2 py-2 border-t border-border">
        <p className="text-[10px] text-gray-500 mb-1 px-1">レイアウト</p>
        <div className="flex gap-1">
          {LAYOUT_OPTIONS.map(opt => (
            <button
              key={opt.mode}
              onClick={() => setMode(opt.mode)}
              className={`flex-1 py-1 text-xs rounded transition-colors ${
                mode === opt.mode
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-gray-400 hover:bg-surface-3'
              }`}
              title={opt.label}
            >
              {opt.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

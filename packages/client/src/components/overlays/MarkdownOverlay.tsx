import { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { filesApi } from '../../lib/api'
import { useSessionStore } from '../../stores/session-store'
import { useLayoutStore } from '../../stores/layout-store'
import { OverlayContainer } from './OverlayContainer'

interface Props {
  onClose: () => void
  filePath?: string
  fullScreen?: boolean
}

/**
 * Markdownオーバーレイ
 * マークダウンファイルの編集・プレビュー
 */
export function MarkdownOverlay({ onClose, filePath: initialPath, fullScreen }: Props) {
  const { sessions } = useSessionStore()
  const { panels, activePanelIndex } = useLayoutStore()
  const [filePath, setFilePath] = useState(initialPath || '')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ファイルパスが指定されていない場合、README.mdを検索
  useEffect(() => {
    if (initialPath) {
      loadFile(initialPath)
      return
    }

    // アクティブセッションのリポジトリからREADME.mdを探す
    const activePanel = panels[activePanelIndex]
    const activeSession = activePanel?.sessionId
      ? sessions.find(s => s.id === activePanel.sessionId)
      : sessions[0]
    const root = activeSession?.worktreePath || activeSession?.repoPath
    if (root) {
      const readmePath = `${root}/README.md`
      setFilePath(readmePath)
      loadFile(readmePath)
    }
  }, [initialPath, sessions, panels, activePanelIndex])

  const loadFile = useCallback((path: string) => {
    if (!path) return
    setLoading(true)
    setError(null)
    filesApi.content(path)
      .then(data => {
        setContent(data.content)
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  // デバウンス付き自動保存
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    if (!filePath) return

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      filesApi.save(filePath, newContent).catch(e => {
        console.error('保存エラー:', e)
      })
    }, 1000)
  }, [filePath])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handlePathChange = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLInputElement
      setFilePath(target.value)
      loadFile(target.value)
    }
  }, [loadFile])

  return (
    <OverlayContainer isOpen={true} onClose={onClose} title="Markdown プレビュー" fullScreen={fullScreen}>
      <div className="flex flex-col h-full">
        {/* ファイルパス入力 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-1">
          <input
            type="text"
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            onKeyDown={handlePathChange}
            placeholder=".md ファイルのパスを入力 (Enterで読み込み)"
            className="flex-1 px-3 py-1.5 text-xs bg-white border border-border rounded text-text-primary placeholder-text-muted outline-none focus:border-accent"
          />
          <button
            onClick={() => setShowEditor(!showEditor)}
            className={`text-xs px-2 py-1.5 rounded transition-colors ${
              showEditor
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
            }`}
          >
            {showEditor ? 'プレビューのみ' : '編集'}
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="flex-1 flex min-h-0">
          {loading && (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              読み込み中...
            </div>
          )}
          {error && (
            <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              {/* エディター */}
              {showEditor && (
                <div className="flex-1 border-r border-border">
                  <textarea
                    value={content}
                    onChange={e => handleContentChange(e.target.value)}
                    className="w-full h-full p-4 text-sm font-mono text-text-primary bg-surface-1 resize-none outline-none custom-scrollbar"
                    spellCheck={false}
                  />
                </div>
              )}

              {/* プレビュー */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="prose prose-sm max-w-none
                  prose-headings:text-text-primary prose-headings:font-semibold
                  prose-p:text-text-primary prose-p:leading-relaxed
                  prose-a:text-accent prose-a:no-underline hover:prose-a:underline
                  prose-code:text-accent prose-code:bg-surface-1 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                  prose-pre:bg-surface-1 prose-pre:border prose-pre:border-border
                  prose-blockquote:border-accent prose-blockquote:text-text-secondary
                  prose-strong:text-text-primary
                  prose-li:text-text-primary
                  prose-th:text-text-primary prose-td:text-text-primary
                  prose-hr:border-border
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || '_ファイルを選択してください_'}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </OverlayContainer>
  )
}

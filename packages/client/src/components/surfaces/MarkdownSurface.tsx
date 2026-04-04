import { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { filesApi } from '../../lib/api'

interface MarkdownSurfaceProps {
  filePath: string
}

/**
 * Markdownサーフェス
 * ファイルのMarkdownをプレビュー表示する
 */
export function MarkdownSurface({ filePath }: MarkdownSurfaceProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // ファイル読み込み
  useEffect(() => {
    setLoading(true)
    setError(null)
    filesApi.content(filePath)
      .then(({ content }) => setContent(content))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [filePath])

  const fileName = filePath.split('/').pop() ?? filePath

  const handleSave = useCallback(async () => {
    try {
      await filesApi.save(filePath, content)
    } catch (e) {
      setError(`保存エラー: ${e}`)
    }
  }, [filePath, content])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted">
        読み込み中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-surface-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-1 bg-surface-1 border-b border-border flex-shrink-0">
        <span className="text-xs text-text-primary">{fileName}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-2 py-0.5 text-xs rounded transition-colors
              ${isEditing
                ? 'bg-accent/20 text-accent'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            {isEditing ? 'プレビュー' : '編集'}
          </button>
          {isEditing && (
            <button
              onClick={handleSave}
              className="px-2 py-0.5 text-xs bg-accent/20 text-accent rounded
                         hover:bg-accent/30 transition-colors"
            >
              保存
            </button>
          )}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full p-4 bg-surface-0 text-text-primary text-sm
                       font-mono resize-none outline-none border-0"
            spellCheck={false}
          />
        ) : (
          <div className="p-4 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

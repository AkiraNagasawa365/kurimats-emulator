import { useEffect, useState, useCallback, useRef } from 'react'
import { filesApi } from '../../lib/api'

interface EditorSurfaceProps {
  filePath: string
  sshHost?: string | null
}

/**
 * エディタサーフェス
 * ファイルの内容を表示・編集する（ローカル/リモート対応）
 * TODO: Monaco Editorに置き換え（#60 統合時）
 */
export function EditorSurface({ filePath, sshHost }: EditorSurfaceProps) {
  const [content, setContent] = useState('')
  const [modified, setModified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const originalContentRef = useRef('')

  // ファイル読み込み
  useEffect(() => {
    setLoading(true)
    setError(null)
    filesApi.content(filePath, sshHost)
      .then(({ content }) => {
        setContent(content)
        originalContentRef.current = content
        setModified(false)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [filePath, sshHost])

  // ファイル名を取得
  const fileName = filePath.split('/').pop() ?? filePath

  // 保存処理
  const handleSave = useCallback(async () => {
    try {
      await filesApi.save(filePath, content, sshHost)
      originalContentRef.current = content
      setModified(false)
    } catch (e) {
      setError(`保存エラー: ${e}`)
    }
  }, [filePath, content, sshHost])

  // Cmd+S でファイル保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleSave])

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
      {/* ファイルヘッダー */}
      <div className="flex items-center justify-between px-3 py-1 bg-surface-1 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-primary">
            {modified && <span className="text-accent mr-1">●</span>}
            {fileName}
          </span>
          <span className="text-text-muted truncate max-w-64">{filePath}</span>
        </div>
        {modified && (
          <button
            onClick={handleSave}
            className="px-2 py-0.5 text-xs bg-accent/20 text-accent rounded
                       hover:bg-accent/30 transition-colors"
          >
            保存 (⌘S)
          </button>
        )}
      </div>

      {/* エディタ本体 */}
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setModified(e.target.value !== originalContentRef.current)
        }}
        className="flex-1 w-full p-3 bg-surface-0 text-text-primary text-sm
                   font-mono resize-none outline-none border-0
                   placeholder-text-muted custom-scrollbar"
        spellCheck={false}
      />
    </div>
  )
}

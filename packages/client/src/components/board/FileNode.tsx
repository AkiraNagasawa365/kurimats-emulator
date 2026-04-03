import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { filesApi } from '../../lib/api'

export interface FileNodeData {
  filePath: string
  language: string
  onClose: () => void
  [key: string]: unknown
}

/**
 * React Flowカスタムノード: ファイルタイル
 * Monaco Editorでファイルをキャンバス上にオンデマンド表示
 */
function FileNodeComponent({ data, selected }: NodeProps) {
  const { filePath, language, onClose } = data as unknown as FileNodeData
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modified, setModified] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  // Monaco Editorインスタンスのdispose（メモリリーク防止）
  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
    }
  }, [])

  const handleEditorMount: OnMount = useCallback((editorInstance) => {
    editorRef.current = editorInstance
    // Cmd+S でファイル保存
    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      2048 | 49, // KeyMod.CtrlCmd | KeyCode.KeyS
      () => {
        if (modified) {
          filesApi.save(filePath, editorInstance.getValue())
            .then(() => setModified(false))
            .catch(e => console.error('保存エラー:', e))
        }
      }
    )
  }, [filePath, modified])

  const fileName = filePath.split('/').pop() || filePath

  // ファイル読み込み
  useEffect(() => {
    setLoading(true)
    setError(null)
    filesApi.content(filePath)
      .then(data => {
        setContent(data.content)
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [filePath])

  // ファイル保存（Cmd+S）
  const handleSave = useCallback(() => {
    if (!modified) return
    filesApi.save(filePath, content)
      .then(() => setModified(false))
      .catch(e => console.error('保存エラー:', e))
  }, [filePath, content, modified])

  // エディタの変更
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value)
      setModified(true)
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* リサイズハンドル */}
      <NodeResizer
        minWidth={300}
        minHeight={200}
        lineClassName="!border-accent/30 hover:!border-accent"
        handleClassName="!w-2.5 !h-2.5 !bg-accent !border-2 !border-surface-0 !rounded-sm"
        isVisible={selected ?? false}
      />

      <div
        className={`flex flex-col rounded-lg overflow-hidden shadow-lg border-2 transition-shadow ${
          selected ? 'border-accent shadow-accent/20' : 'border-border shadow-md'
        }`}
        style={{ width: '100%', height: '100%' }}
      >
        {/* タイトルバー（ドラッグハンドル） */}
        <div className="drag-handle cursor-grab active:cursor-grabbing flex items-center justify-between px-3 py-1.5 bg-tile-header border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-text-muted text-xs">📄</span>
            <span className="text-xs font-medium text-text-primary truncate">{fileName}</span>
            {modified && <span className="text-accent text-xs">●</span>}
            <span className="text-[9px] px-1.5 py-0.5 bg-surface-2 text-text-muted rounded">{language}</span>
          </div>
          <div className="flex items-center gap-1">
            {modified && (
              <button
                onClick={(e) => { e.stopPropagation(); handleSave() }}
                className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors nopan nodrag"
                title="保存 (⌘S)"
              >
                保存
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              className="text-text-muted hover:text-text-primary px-1 rounded hover:bg-surface-2 transition-colors nopan nodrag"
              title="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 min-h-0 nopan nodrag nowheel">
          {loading && (
            <div className="flex items-center justify-center h-full bg-surface-0 text-text-muted text-sm">
              読み込み中...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full bg-surface-0 text-red-400 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && (
            <Editor
              value={content}
              language={language}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                readOnly: false,
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 1.5,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                folding: true,
                automaticLayout: true,
                padding: { top: 8 },
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
              }}
            />
          )}
        </div>
      </div>

      {/* React Flow接続ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-accent !border-2 !border-surface-0 hover:!bg-blue-400 !transition-colors"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-accent !border-2 !border-surface-0 hover:!bg-blue-400 !transition-colors"
      />
    </div>
  )
}

export const FileNode = memo(FileNodeComponent)

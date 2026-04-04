import { useState, useEffect, useCallback } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { filesApi } from '../../lib/api'
import { OverlayContainer } from './OverlayContainer'

interface Props {
  filePath: string
  onClose: () => void
}

// 拡張子から言語を推定
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', css: 'css', html: 'html', md: 'markdown',
    py: 'python', rs: 'rust', go: 'go', sh: 'bash', bash: 'bash',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql',
    dockerfile: 'docker', makefile: 'makefile',
  }
  return map[ext] || 'text'
}

/**
 * コードビューアオーバーレイ
 * ファイル内容をシンタックスハイライト付きで表示
 */
export function CodeViewerOverlay({ filePath, onClose }: Props) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wordWrap, setWordWrap] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!filePath) return
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

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [content])

  const language = getLanguage(filePath)
  const fileName = filePath.split('/').pop() || filePath

  return (
    <OverlayContainer isOpen={true} onClose={onClose} title={fileName}>
      <div className="flex flex-col h-full">
        {/* ツールバー */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-1">
          <span className="text-xs text-text-muted truncate flex-1">{filePath}</span>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                wordWrap
                  ? 'bg-accent text-surface-0'
                  : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
              }`}
              title="折り返し切り替え"
            >
              折り返し
            </button>
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1 rounded bg-surface-2 text-text-secondary hover:bg-surface-3 transition-colors"
              title="コピー"
            >
              {copied ? '✓ コピー済み' : 'コピー'}
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-auto custom-scrollbar">
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
          {!loading && !error && (
            <SyntaxHighlighter
              language={language}
              style={oneDark}
              showLineNumbers
              wrapLines={wordWrap}
              wrapLongLines={wordWrap}
              customStyle={{
                margin: 0,
                padding: '12px',
                fontSize: '13px',
                lineHeight: '1.5',
                background: '#0f1419',
                minHeight: '100%',
              }}
              lineNumberStyle={{
                minWidth: '3em',
                paddingRight: '1em',
                color: '#64748b',
                userSelect: 'none',
              }}
            >
              {content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </OverlayContainer>
  )
}

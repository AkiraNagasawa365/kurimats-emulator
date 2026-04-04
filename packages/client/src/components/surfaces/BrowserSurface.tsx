import { useState, useCallback } from 'react'

interface BrowserSurfaceProps {
  url: string
}

/**
 * ブラウザサーフェス
 * iframe でlocalhostプレビューを表示する
 */
export function BrowserSurface({ url: initialUrl }: BrowserSurfaceProps) {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)

  const handleNavigate = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    let target = inputUrl
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`
    }
    setUrl(target)
  }, [inputUrl])

  const handleRefresh = useCallback(() => {
    // iframe を再読み込みするためにURLを一旦クリアして戻す
    setUrl('')
    requestAnimationFrame(() => setUrl(url))
  }, [url])

  return (
    <div className="w-full h-full flex flex-col bg-surface-0">
      {/* URLバー */}
      <form
        onSubmit={handleNavigate}
        className="flex items-center gap-1 px-2 py-1 bg-surface-1 border-b border-border flex-shrink-0"
      >
        <button
          type="button"
          className="px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary
                     bg-surface-2 rounded transition-colors"
          onClick={handleRefresh}
          title="再読み込み"
        >
          ↻
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          className="flex-1 px-2 py-0.5 text-xs bg-surface-0 border border-border rounded
                     text-text-primary placeholder-text-muted focus:border-accent outline-none"
          placeholder="URL を入力..."
        />
      </form>

      {/* iframe コンテンツ */}
      <div className="flex-1">
        {url ? (
          <iframe
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="ブラウザプレビュー"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            読み込み中...
          </div>
        )}
      </div>
    </div>
  )
}

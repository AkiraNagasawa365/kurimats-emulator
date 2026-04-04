import { useEffect, useRef } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  fullScreen?: boolean
}

/**
 * オーバーレイコンテナ
 * 右側からスライドインするパネル（fullScreen時は全画面）
 */
export function OverlayContainer({ isOpen, onClose, title, children, fullScreen }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escapeキーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handler)
    }
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end animate-fade-in">
      {/* 背景 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* パネル */}
      <div
        ref={panelRef}
        className={`relative h-full bg-surface-1 shadow-2xl flex flex-col animate-slide-in ${
          fullScreen ? 'w-full' : 'w-1/2 max-w-[700px] min-w-[400px]'
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
            title="閉じる"
          >
            ×
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

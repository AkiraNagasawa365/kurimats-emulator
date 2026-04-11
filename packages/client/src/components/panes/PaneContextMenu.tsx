import { useCallback, useEffect, useRef, useState } from 'react'
import { usePaneStore } from '../../stores/pane-store'

interface PaneContextMenuProps {
  paneId: string
  x: number
  y: number
  onClose: () => void
}

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  separator?: false
}

interface Separator {
  separator: true
}

type MenuEntry = MenuItem | Separator

/**
 * ペインの右クリックコンテキストメニュー
 */
export function PaneContextMenu({ paneId, x, y, onClose }: PaneContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState({ x, y })
  const { splitPane, closePane, toggleZoom } = usePaneStore()

  // 画面外にはみ出さないよう位置調整
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const newX = Math.min(x, window.innerWidth - rect.width - 8)
    const newY = Math.min(y, window.innerHeight - rect.height - 8)
    setAdjustedPos({ x: newX, y: newY })
  }, [x, y])

  // 外部クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Escapeで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const items: MenuEntry[] = [
    {
      label: '縦に分割',
      shortcut: '⌘D',
      action: () => { splitPane(paneId, 'vertical'); onClose() },
    },
    {
      label: '横に分割',
      shortcut: '⌘⇧D',
      action: () => { splitPane(paneId, 'horizontal'); onClose() },
    },
    { separator: true },
    {
      label: 'ズーム切替',
      shortcut: '⌘⇧↩',
      action: () => { toggleZoom(paneId); onClose() },
    },
    { separator: true },
    {
      label: 'ペインを閉じる',
      shortcut: '⌘W',
      action: () => { closePane(paneId); onClose() },
    },
  ]

  const handleItemClick = useCallback((item: MenuItem) => {
    item.action()
  }, [])

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-chrome border border-border rounded-lg shadow-lg py-1 min-w-48"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 border-t border-border" />
        ) : (
          <button
            key={i}
            className="w-full px-3 py-1.5 text-sm text-text-primary hover:bg-surface-2
                       flex items-center justify-between transition-colors"
            onClick={() => handleItemClick(item)}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 text-text-muted text-xs">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  )
}

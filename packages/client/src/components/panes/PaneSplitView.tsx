import { useCallback, useRef, type ReactNode } from 'react'
import type { PaneSplit } from '@kurimats/shared'
import { usePaneStore } from '../../stores/pane-store'

interface PaneSplitViewProps {
  split: PaneSplit
  children: [ReactNode, ReactNode]
}

/**
 * スプリットコンテナ + ドラッグ可能ディバイダ
 * 子要素を direction に応じて横並び or 縦並びに配置
 */
export function PaneSplitView({ split, children }: PaneSplitViewProps) {
  const resizeSplit = usePaneStore(s => s.resizeSplit)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const isVertical = split.direction === 'vertical'

  // 最初の子の比率を取得（リーフでもスプリットでもratioフィールドを持つ）
  const firstChild = split.children[0]
  const ratio = firstChild.ratio ?? 0.5

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true

    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const newRatio = isVertical
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height
      resizeSplit(split.id, newRatio)
    }

    const onMouseUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [split.id, isVertical, resizeSplit])

  const firstStyle = isVertical
    ? { width: `${ratio * 100}%`, height: '100%' }
    : { width: '100%', height: `${ratio * 100}%` }

  const secondStyle = isVertical
    ? { width: `${(1 - ratio) * 100}%`, height: '100%' }
    : { width: '100%', height: `${(1 - ratio) * 100}%` }

  return (
    <div
      ref={containerRef}
      className={`flex ${isVertical ? 'flex-row' : 'flex-col'} w-full h-full`}
    >
      {/* 最初の子 */}
      <div style={firstStyle} className="overflow-hidden">
        {children[0]}
      </div>

      {/* ディバイダ */}
      <div
        className={`
          flex-shrink-0 bg-border hover:bg-accent transition-colors
          ${isVertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        `}
        onMouseDown={handleMouseDown}
      />

      {/* 2番目の子 */}
      <div style={secondStyle} className="overflow-hidden">
        {children[1]}
      </div>
    </div>
  )
}

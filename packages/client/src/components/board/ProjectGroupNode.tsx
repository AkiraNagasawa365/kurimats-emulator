import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

export interface ProjectGroupNodeData {
  label: string
  color: string
  projectId: string
  [key: string]: unknown
}

/**
 * プロジェクトグループの背景枠ノード
 * セッションノードの後ろに半透明の枠を表示
 */
function ProjectGroupNodeComponent({ data }: NodeProps) {
  const { label, color } = data as unknown as ProjectGroupNodeData

  return (
    <div
      className="rounded-xl border-2 border-dashed cursor-grab active:cursor-grabbing"
      style={{
        width: '100%',
        height: '100%',
        borderColor: color,
        backgroundColor: `${color}08`,
      }}
    >
      <div
        className="absolute -top-6 left-2 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap cursor-grab active:cursor-grabbing"
        style={{ color, backgroundColor: `${color}18` }}
      >
        {label}
      </div>
    </div>
  )
}

export const ProjectGroupNode = memo(ProjectGroupNodeComponent)

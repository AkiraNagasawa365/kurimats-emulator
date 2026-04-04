import type { PaneNode } from '@kurimats/shared'
import { PaneSplitView } from './PaneSplitView'
import { PaneLeafView } from './PaneLeafView'

interface PaneRendererProps {
  node: PaneNode
}

/**
 * ペインツリーの再帰レンダラー
 * PaneNode（リーフ or スプリット）に応じてコンポーネントを分岐する
 */
export function PaneRenderer({ node }: PaneRendererProps) {
  if (node.kind === 'leaf') {
    return <PaneLeafView leaf={node} />
  }

  return (
    <PaneSplitView split={node}>
      <PaneRenderer node={node.children[0]} />
      <PaneRenderer node={node.children[1]} />
    </PaneSplitView>
  )
}

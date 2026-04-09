/**
 * ペインツリー操作ユーティリティ
 * workspaces.ts と index.ts で共通利用されるヘルパー関数群
 */
import type { PaneNode, PaneLeaf, SplitDirection } from '@kurimats/shared'

/** 一意なID生成 */
export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** ペインツリーから全セッションIDを収集 */
export function collectSessionIds(node: PaneNode): string[] {
  if (!node) return []
  if (node.kind === 'leaf') {
    return [node.sessionId]
  }
  if (!node.children || node.children.length < 2) return []
  return [
    ...collectSessionIds(node.children[0]),
    ...collectSessionIds(node.children[1]),
  ]
}

/** ツリー内のリーフ数をカウント */
export function countLeaves(node: PaneNode): number {
  if (node.kind === 'leaf') return 1
  return countLeaves(node.children[0]) + countLeaves(node.children[1])
}

/** IDでリーフを検索 */
export function findLeaf(node: PaneNode, leafId: string): PaneLeaf | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  return findLeaf(node.children[0], leafId) ?? findLeaf(node.children[1], leafId)
}

/** ツリーの最初のリーフIDを取得 */
export function findFirstLeafId(node: PaneNode): string {
  if (node.kind === 'leaf') return node.id
  return findFirstLeafId(node.children[0])
}

/** ツリーに指定IDのリーフが含まれるか */
export function containsLeafId(node: PaneNode, leafId: string): boolean {
  if (node.kind === 'leaf') return node.id === leafId
  return containsLeafId(node.children[0], leafId) || containsLeafId(node.children[1], leafId)
}

/** 全ペインが等分になるようratioを再計算 */
export function rebalanceRatios(tree: PaneNode): PaneNode {
  if (tree.kind === 'leaf') return tree
  const [first, second] = tree.children
  const firstCount = countLeaves(first)
  const total = firstCount + countLeaves(second)
  const firstRatio = firstCount / total
  const newFirst = rebalanceRatios(first)
  const newSecond = rebalanceRatios(second)
  return {
    ...tree,
    children: [
      { ...newFirst, ratio: firstRatio },
      { ...newSecond, ratio: 1 - firstRatio },
    ],
  } as PaneNode
}

/** ツリー内の指定リーフを分割して新しいツリーを返す */
export function splitLeafInTree(
  tree: PaneNode,
  leafId: string,
  direction: SplitDirection,
  newLeaf: PaneLeaf,
): PaneNode | null {
  if (tree.kind === 'leaf') {
    if (tree.id === leafId) {
      return {
        kind: 'split',
        id: genId('split'),
        direction,
        ratio: 0.5,
        children: [{ ...tree, ratio: 0.5 }, newLeaf],
      }
    }
    return null
  }

  const newFirst = splitLeafInTree(tree.children[0], leafId, direction, newLeaf)
  if (newFirst) {
    return { ...tree, children: [newFirst, tree.children[1]] }
  }

  const newSecond = splitLeafInTree(tree.children[1], leafId, direction, newLeaf)
  if (newSecond) {
    return { ...tree, children: [tree.children[0], newSecond] }
  }

  return null
}

/** リーフを閉じて兄弟を昇格 */
export function closeLeafInTree(tree: PaneNode, leafId: string): PaneNode | null {
  if (tree.kind === 'leaf') {
    return tree.id === leafId ? null : tree
  }

  const [first, second] = tree.children

  if (first.id === leafId) return second.kind === 'leaf' ? { ...second, ratio: 0.5 } : second
  if (second.id === leafId) return first.kind === 'leaf' ? { ...first, ratio: 0.5 } : first

  const newFirst = closeLeafInTree(first, leafId)
  if (newFirst !== first) {
    if (newFirst === null) return second.kind === 'leaf' ? { ...second, ratio: 0.5 } : second
    return { ...tree, children: [newFirst, second] }
  }

  const newSecond = closeLeafInTree(second, leafId)
  if (newSecond !== second) {
    if (newSecond === null) return first.kind === 'leaf' ? { ...first, ratio: 0.5 } : first
    return { ...tree, children: [first, newSecond] }
  }

  return tree
}

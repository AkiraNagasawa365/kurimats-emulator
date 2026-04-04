/**
 * ペインツリー操作ユーティリティ（純粋関数）
 *
 * バイナリツリーベースのペイン分割を管理する。
 * 全関数はイミュータブル — 新しいツリーを返す。
 */
import type { PaneNode, PaneLeaf, PaneSplit, SplitDirection, Surface } from '@kurimats/shared'

// ========== ID生成 ==========

let counter = 0

/** 一意なペインIDを生成 */
export function generatePaneId(): string {
  return `pane-${Date.now()}-${++counter}`
}

/** 一意なスプリットIDを生成 */
export function generateSplitId(): string {
  return `split-${Date.now()}-${++counter}`
}

/** 一意なサーフェスIDを生成 */
export function generateSurfaceId(): string {
  return `surface-${Date.now()}-${++counter}`
}

// ========== ツリー走査 ==========

/** IDでノードを検索（深さ優先） */
export function findNode(tree: PaneNode, id: string): PaneNode | null {
  if (tree.id === id) return tree
  if (tree.kind === 'leaf') return null
  return findNode(tree.children[0], id) ?? findNode(tree.children[1], id)
}

/** IDのノードの親スプリットを検索 */
export function findParent(tree: PaneNode, id: string): PaneSplit | null {
  if (tree.kind === 'leaf') return null
  for (const child of tree.children) {
    if (child.id === id) return tree
  }
  return findParent(tree.children[0], id) ?? findParent(tree.children[1], id)
}

/** 全リーフノードを取得 */
export function collectLeaves(tree: PaneNode): PaneLeaf[] {
  if (tree.kind === 'leaf') return [tree]
  return [...collectLeaves(tree.children[0]), ...collectLeaves(tree.children[1])]
}

/** ツリー内のリーフ数を取得 */
export function countLeaves(tree: PaneNode): number {
  if (tree.kind === 'leaf') return 1
  return countLeaves(tree.children[0]) + countLeaves(tree.children[1])
}

/** 最初のリーフを取得 */
export function firstLeaf(tree: PaneNode): PaneLeaf {
  if (tree.kind === 'leaf') return tree
  return firstLeaf(tree.children[0])
}

// ========== バウンディングレクト計算 ==========

export interface PaneRect {
  pane: PaneLeaf
  x: number
  y: number
  width: number
  height: number
}

/** 全リーフをバウンディングレクト付きで取得（フォーカスナビ用） */
export function flattenWithRects(
  tree: PaneNode,
  bounds: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 1, height: 1 },
): PaneRect[] {
  if (tree.kind === 'leaf') {
    return [{ pane: tree, ...bounds }]
  }

  const [first, second] = tree.children
  const firstRatio = first.kind === 'leaf' ? first.ratio : 0.5
  const secondRatio = 1 - firstRatio

  if (tree.direction === 'vertical') {
    // 左右分割
    const firstWidth = bounds.width * firstRatio
    const secondWidth = bounds.width * secondRatio
    return [
      ...flattenWithRects(first, { x: bounds.x, y: bounds.y, width: firstWidth, height: bounds.height }),
      ...flattenWithRects(second, { x: bounds.x + firstWidth, y: bounds.y, width: secondWidth, height: bounds.height }),
    ]
  } else {
    // 上下分割
    const firstHeight = bounds.height * firstRatio
    const secondHeight = bounds.height * secondRatio
    return [
      ...flattenWithRects(first, { x: bounds.x, y: bounds.y, width: bounds.width, height: firstHeight }),
      ...flattenWithRects(second, { x: bounds.x, y: bounds.y + firstHeight, width: bounds.width, height: secondHeight }),
    ]
  }
}

// ========== ツリー変異（イミュータブル） ==========

/** 空のリーフを作成 */
export function createLeaf(surfaces: Surface[] = [], ratio = 0.5): PaneLeaf {
  return {
    kind: 'leaf',
    id: generatePaneId(),
    surfaces,
    activeSurfaceIndex: 0,
    ratio,
  }
}

/** リーフを分割 → 新しいスプリットノードに置換 */
export function splitLeaf(
  tree: PaneNode,
  leafId: string,
  direction: SplitDirection,
  newLeafSurfaces: Surface[] = [],
): PaneNode {
  return mapNode(tree, leafId, (node) => {
    if (node.kind !== 'leaf') return node
    const newLeaf = createLeaf(newLeafSurfaces, 0.5)
    const originalLeaf: PaneLeaf = { ...node, ratio: 0.5 }
    const split: PaneSplit = {
      kind: 'split',
      id: generateSplitId(),
      direction,
      children: [originalLeaf, newLeaf],
    }
    return split
  })
}

/** リーフを閉じる → 兄弟を昇格 */
export function closeLeaf(tree: PaneNode, leafId: string): PaneNode | null {
  // ルートがリーフ = 最後のペインなので閉じない
  if (tree.kind === 'leaf') {
    return tree.id === leafId ? null : tree
  }

  const [first, second] = tree.children

  // 直接の子が対象なら兄弟を返す
  if (first.id === leafId) return second
  if (second.id === leafId) return first

  // 再帰的に探索
  const newFirst = closeLeaf(first, leafId)
  if (newFirst !== first) {
    // first側で変更があった
    return newFirst === null ? second : { ...tree, children: [newFirst, second] }
  }

  const newSecond = closeLeaf(second, leafId)
  if (newSecond !== second) {
    return newSecond === null ? first : { ...tree, children: [first, newSecond] }
  }

  return tree
}

/** スプリットの比率を変更 */
export function resizeSplit(tree: PaneNode, splitId: string, ratio: number): PaneNode {
  const clamped = Math.max(0.1, Math.min(0.9, ratio))

  return mapNode(tree, splitId, (node) => {
    if (node.kind !== 'split') return node
    const [first, second] = node.children
    const newFirst = first.kind === 'leaf'
      ? { ...first, ratio: clamped }
      : first
    const newSecond = second.kind === 'leaf'
      ? { ...second, ratio: 1 - clamped }
      : second
    return { ...node, children: [newFirst, newSecond] as [PaneNode, PaneNode] }
  })
}

/** ペインにサーフェスを追加 */
export function addSurface(tree: PaneNode, paneId: string, surface: Surface): PaneNode {
  return mapNode(tree, paneId, (node) => {
    if (node.kind !== 'leaf') return node
    return {
      ...node,
      surfaces: [...node.surfaces, surface],
      activeSurfaceIndex: node.surfaces.length, // 新しいタブをアクティブに
    }
  })
}

/** ペインからサーフェスを削除 */
export function removeSurface(tree: PaneNode, paneId: string, surfaceId: string): PaneNode {
  return mapNode(tree, paneId, (node) => {
    if (node.kind !== 'leaf') return node
    const newSurfaces = node.surfaces.filter(s => s.id !== surfaceId)
    const newIndex = Math.min(node.activeSurfaceIndex, Math.max(0, newSurfaces.length - 1))
    return { ...node, surfaces: newSurfaces, activeSurfaceIndex: newIndex }
  })
}

/** ペインのアクティブサーフェスを切替 */
export function switchSurface(tree: PaneNode, paneId: string, index: number): PaneNode {
  return mapNode(tree, paneId, (node) => {
    if (node.kind !== 'leaf') return node
    const clamped = Math.max(0, Math.min(index, node.surfaces.length - 1))
    return { ...node, activeSurfaceIndex: clamped }
  })
}

// ========== フォーカスナビゲーション ==========

type Direction = 'up' | 'down' | 'left' | 'right'

/** 指定方向の隣接ペインを検索 */
export function findAdjacentPane(
  tree: PaneNode,
  currentPaneId: string,
  direction: Direction,
): PaneLeaf | null {
  const rects = flattenWithRects(tree)
  const current = rects.find(r => r.pane.id === currentPaneId)
  if (!current) return null

  const cx = current.x + current.width / 2
  const cy = current.y + current.height / 2

  // 方向に基づいて候補をフィルタ
  const candidates = rects.filter(r => {
    if (r.pane.id === currentPaneId) return false
    const rx = r.x + r.width / 2
    const ry = r.y + r.height / 2
    switch (direction) {
      case 'left': return rx < cx
      case 'right': return rx > cx
      case 'up': return ry < cy
      case 'down': return ry > cy
    }
  })

  if (candidates.length === 0) return null

  // 中心間距離でソート
  candidates.sort((a, b) => {
    const da = Math.hypot(a.x + a.width / 2 - cx, a.y + a.height / 2 - cy)
    const db = Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy)
    return da - db
  })

  return candidates[0].pane
}

// ========== 内部ヘルパー ==========

/** IDでノードを見つけて変換する（イミュータブル） */
function mapNode(tree: PaneNode, id: string, transform: (node: PaneNode) => PaneNode): PaneNode {
  if (tree.id === id) return transform(tree)
  if (tree.kind === 'leaf') return tree
  const newFirst = mapNode(tree.children[0], id, transform)
  const newSecond = mapNode(tree.children[1], id, transform)
  if (newFirst === tree.children[0] && newSecond === tree.children[1]) return tree
  return { ...tree, children: [newFirst, newSecond] }
}

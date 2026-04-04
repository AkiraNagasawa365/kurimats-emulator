import { describe, it, expect, beforeEach } from 'vitest'
import type { PaneLeaf, PaneSplit, PaneNode, Surface } from '@kurimats/shared'
import {
  findNode,
  findParent,
  collectLeaves,
  countLeaves,
  firstLeaf,
  flattenWithRects,
  createLeaf,
  splitLeaf,
  closeLeaf,
  resizeSplit,
  addSurface,
  removeSurface,
  switchSurface,
  findAdjacentPane,
} from '../lib/pane-tree-utils'

// ========== テストヘルパー ==========

function makeLeaf(id: string, ratio = 0.5, surfaces: Surface[] = []): PaneLeaf {
  return { kind: 'leaf', id, surfaces, activeSurfaceIndex: 0, ratio }
}

function makeSplit(id: string, direction: 'horizontal' | 'vertical', children: [PaneNode, PaneNode], ratio = 0.5): PaneSplit {
  return { kind: 'split', id, direction, children, ratio }
}

function makeTerminalSurface(id: string, sessionId: string): Surface {
  return { id, type: 'terminal', target: sessionId, label: `Terminal ${id}` }
}

// テスト用ツリー構造:
//
//   split-root (vertical)
//   ├── leaf-A
//   └── split-inner (horizontal)
//       ├── leaf-B
//       └── leaf-C
//
let leafA: PaneLeaf
let leafB: PaneLeaf
let leafC: PaneLeaf
let splitInner: PaneSplit
let splitRoot: PaneSplit

beforeEach(() => {
  leafA = makeLeaf('leaf-A', 0.4)
  leafB = makeLeaf('leaf-B', 0.5)
  leafC = makeLeaf('leaf-C', 0.5)
  splitInner = makeSplit('split-inner', 'horizontal', [leafB, leafC])
  splitRoot = makeSplit('split-root', 'vertical', [leafA, splitInner])
})

// ========== ツリー走査 ==========

describe('findNode', () => {
  it('ルートノードを検索', () => {
    expect(findNode(splitRoot, 'split-root')).toBe(splitRoot)
  })

  it('リーフノードを検索', () => {
    expect(findNode(splitRoot, 'leaf-B')).toBe(leafB)
  })

  it('存在しないIDはnullを返す', () => {
    expect(findNode(splitRoot, 'nonexistent')).toBeNull()
  })
})

describe('findParent', () => {
  it('直接の子の親を検索', () => {
    expect(findParent(splitRoot, 'leaf-A')).toBe(splitRoot)
  })

  it('ネストされた子の親を検索', () => {
    expect(findParent(splitRoot, 'leaf-B')).toBe(splitInner)
  })

  it('ルートの親はnull', () => {
    expect(findParent(splitRoot, 'split-root')).toBeNull()
  })
})

describe('collectLeaves', () => {
  it('全リーフを取得', () => {
    const leaves = collectLeaves(splitRoot)
    expect(leaves).toHaveLength(3)
    expect(leaves.map(l => l.id)).toEqual(['leaf-A', 'leaf-B', 'leaf-C'])
  })

  it('単一リーフツリー', () => {
    const single = makeLeaf('only')
    expect(collectLeaves(single)).toHaveLength(1)
  })
})

describe('countLeaves', () => {
  it('リーフ数を数える', () => {
    expect(countLeaves(splitRoot)).toBe(3)
  })
})

describe('firstLeaf', () => {
  it('最初のリーフを返す', () => {
    expect(firstLeaf(splitRoot).id).toBe('leaf-A')
  })
})

// ========== バウンディングレクト ==========

describe('flattenWithRects', () => {
  it('全リーフのバウンディングレクトを計算', () => {
    const rects = flattenWithRects(splitRoot)
    expect(rects).toHaveLength(3)

    // leaf-A: 左側 40%（vertical split, ratio=0.4）
    const rectA = rects.find(r => r.pane.id === 'leaf-A')!
    expect(rectA.x).toBeCloseTo(0)
    expect(rectA.width).toBeCloseTo(0.4)
    expect(rectA.height).toBeCloseTo(1)

    // leaf-B と leaf-C: 右側60%を上下50%ずつ
    const rectB = rects.find(r => r.pane.id === 'leaf-B')!
    expect(rectB.x).toBeCloseTo(0.4)
    expect(rectB.width).toBeCloseTo(0.6)
    expect(rectB.height).toBeCloseTo(0.5)

    const rectC = rects.find(r => r.pane.id === 'leaf-C')!
    expect(rectC.x).toBeCloseTo(0.4)
    expect(rectC.y).toBeCloseTo(0.5)
    expect(rectC.height).toBeCloseTo(0.5)
  })
})

// ========== ツリー変異 ==========

describe('createLeaf', () => {
  it('空のリーフを生成', () => {
    const leaf = createLeaf()
    expect(leaf.kind).toBe('leaf')
    expect(leaf.surfaces).toEqual([])
    expect(leaf.ratio).toBe(0.5)
  })

  it('サーフェス付きリーフを生成', () => {
    const surface = makeTerminalSurface('s1', 'session-1')
    const leaf = createLeaf([surface], 0.6)
    expect(leaf.surfaces).toHaveLength(1)
    expect(leaf.ratio).toBe(0.6)
  })
})

describe('splitLeaf', () => {
  it('リーフを縦分割', () => {
    const result = splitLeaf(splitRoot, 'leaf-A', 'vertical')
    // leaf-A の位置がスプリットに置換される
    expect(result.kind).toBe('split')
    if (result.kind !== 'split') return
    const newNode = result.children[0]
    expect(newNode.kind).toBe('split')
    if (newNode.kind !== 'split') return
    expect(newNode.direction).toBe('vertical')
    expect(newNode.children[0].id).toBe('leaf-A')
    expect(newNode.children[1].kind).toBe('leaf')
  })

  it('ツリー内のリーフ数が1増える', () => {
    const result = splitLeaf(splitRoot, 'leaf-B', 'horizontal')
    expect(countLeaves(result)).toBe(4)
  })

  it('元のツリーは変更されない（イミュータブル）', () => {
    splitLeaf(splitRoot, 'leaf-A', 'vertical')
    expect(countLeaves(splitRoot)).toBe(3)
  })
})

describe('closeLeaf', () => {
  it('リーフを閉じると兄弟が昇格', () => {
    const result = closeLeaf(splitRoot, 'leaf-B')!
    // split-inner から leaf-B を削除 → leaf-C が昇格
    // split-root の children[1] が leaf-C になる
    expect(result.kind).toBe('split')
    if (result.kind === 'split') {
      expect(result.children[0].id).toBe('leaf-A')
      expect(result.children[1].id).toBe('leaf-C')
    }
  })

  it('リーフ削除後にratioが均等化される', () => {
    const result = closeLeaf(splitRoot, 'leaf-B')!
    expect(result.kind).toBe('split')
    if (result.kind === 'split') {
      expect(result.ratio).toBe(0.5)
    }
  })

  it('最後のリーフは閉じない（nullを返す）', () => {
    const single = makeLeaf('only')
    expect(closeLeaf(single, 'only')).toBeNull()
  })

  it('存在しないIDは変更なし', () => {
    const result = closeLeaf(splitRoot, 'nonexistent')
    expect(result).toBe(splitRoot)
  })

  it('ツリー内のリーフ数が1減る', () => {
    const result = closeLeaf(splitRoot, 'leaf-C')!
    expect(countLeaves(result)).toBe(2)
  })
})

describe('resizeSplit', () => {
  it('スプリットの比率を変更', () => {
    const result = resizeSplit(splitRoot, 'split-root', 0.7)
    if (result.kind === 'split') {
      const first = result.children[0] as PaneLeaf
      expect(first.ratio).toBeCloseTo(0.7)
    }
  })

  it('比率を0.1-0.9にクランプ', () => {
    const result = resizeSplit(splitRoot, 'split-root', 0.95)
    if (result.kind === 'split') {
      const first = result.children[0] as PaneLeaf
      expect(first.ratio).toBeCloseTo(0.9)
    }
  })
})

// ========== サーフェス操作 ==========

describe('addSurface', () => {
  it('ペインにサーフェスを追加', () => {
    const surface = makeTerminalSurface('s1', 'session-1')
    const result = addSurface(splitRoot, 'leaf-A', surface)
    const leaf = findNode(result, 'leaf-A') as PaneLeaf
    expect(leaf.surfaces).toHaveLength(1)
    expect(leaf.activeSurfaceIndex).toBe(0) // 最初のサーフェス
  })

  it('追加時にアクティブインデックスが新しいタブに移動', () => {
    const s1 = makeTerminalSurface('s1', 'session-1')
    const s2 = makeTerminalSurface('s2', 'session-2')
    let tree = addSurface(splitRoot, 'leaf-A', s1)
    tree = addSurface(tree, 'leaf-A', s2)
    const leaf = findNode(tree, 'leaf-A') as PaneLeaf
    expect(leaf.surfaces).toHaveLength(2)
    expect(leaf.activeSurfaceIndex).toBe(1)
  })
})

describe('removeSurface', () => {
  it('サーフェスを削除', () => {
    const s1 = makeTerminalSurface('s1', 'session-1')
    const s2 = makeTerminalSurface('s2', 'session-2')
    let tree = addSurface(splitRoot, 'leaf-A', s1)
    tree = addSurface(tree, 'leaf-A', s2)
    tree = removeSurface(tree, 'leaf-A', 's1')
    const leaf = findNode(tree, 'leaf-A') as PaneLeaf
    expect(leaf.surfaces).toHaveLength(1)
    expect(leaf.surfaces[0].id).toBe('s2')
  })

  it('アクティブインデックスが範囲内に収まる', () => {
    const s1 = makeTerminalSurface('s1', 'session-1')
    let tree = addSurface(splitRoot, 'leaf-A', s1)
    tree = removeSurface(tree, 'leaf-A', 's1')
    const leaf = findNode(tree, 'leaf-A') as PaneLeaf
    expect(leaf.activeSurfaceIndex).toBe(0)
  })
})

describe('switchSurface', () => {
  it('アクティブサーフェスを切替', () => {
    const s1 = makeTerminalSurface('s1', 'session-1')
    const s2 = makeTerminalSurface('s2', 'session-2')
    let tree = addSurface(splitRoot, 'leaf-A', s1)
    tree = addSurface(tree, 'leaf-A', s2)
    tree = switchSurface(tree, 'leaf-A', 0)
    const leaf = findNode(tree, 'leaf-A') as PaneLeaf
    expect(leaf.activeSurfaceIndex).toBe(0)
  })

  it('範囲外のインデックスをクランプ', () => {
    const s1 = makeTerminalSurface('s1', 'session-1')
    let tree = addSurface(splitRoot, 'leaf-A', s1)
    tree = switchSurface(tree, 'leaf-A', 99)
    const leaf = findNode(tree, 'leaf-A') as PaneLeaf
    expect(leaf.activeSurfaceIndex).toBe(0) // surfaces.length - 1 = 0
  })
})

// ========== フォーカスナビゲーション ==========

describe('findAdjacentPane', () => {
  it('右方向のペインを検索', () => {
    const result = findAdjacentPane(splitRoot, 'leaf-A', 'right')
    // leaf-A は左側、leaf-B/C は右側
    expect(result).not.toBeNull()
    expect(['leaf-B', 'leaf-C']).toContain(result!.id)
  })

  it('左方向のペインを検索', () => {
    const result = findAdjacentPane(splitRoot, 'leaf-B', 'left')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('leaf-A')
  })

  it('下方向のペインを検索', () => {
    const result = findAdjacentPane(splitRoot, 'leaf-B', 'down')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('leaf-C')
  })

  it('上方向のペインを検索', () => {
    const result = findAdjacentPane(splitRoot, 'leaf-C', 'up')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('leaf-B')
  })

  it('候補がない方向はnullを返す', () => {
    const result = findAdjacentPane(splitRoot, 'leaf-A', 'left')
    expect(result).toBeNull()
  })
})

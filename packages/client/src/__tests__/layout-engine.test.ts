import { describe, it, expect } from 'vitest'
import {
  gridLayout,
  flowLayout,
  treeLayout,
  findOptimalPosition,
  detectOverlaps,
  resolveOverlaps,
  resizeToFit,
  type CardRect,
} from '../lib/layout-engine'

// --- gridLayout ---
describe('gridLayout', () => {
  it('カードなしで空配列を返す', () => {
    expect(gridLayout([], 800, 600)).toEqual([])
  })

  it('1個のカードは左上に配置される', () => {
    const cards: CardRect[] = [{ id: 'a', x: 0, y: 0, width: 100, height: 100 }]
    const result = gridLayout(cards, 800, 600)
    expect(result).toHaveLength(1)
    expect(result[0].x).toBeGreaterThan(0)
    expect(result[0].y).toBeGreaterThan(0)
  })

  it('4個のカードが2x2グリッドになる', () => {
    const cards: CardRect[] = Array.from({ length: 4 }, (_, i) => ({
      id: `card-${i}`,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }))
    const result = gridLayout(cards, 800, 600)
    expect(result).toHaveLength(4)

    // 2列であることを確認
    const xValues = new Set(result.map(c => c.x))
    const yValues = new Set(result.map(c => c.y))
    expect(xValues.size).toBe(2)
    expect(yValues.size).toBe(2)
  })

  it('gapパラメータが反映される', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 0, y: 0, width: 100, height: 100 },
    ]
    const resultSmallGap = gridLayout(cards, 800, 600, 8)
    const resultLargeGap = gridLayout(cards, 800, 600, 32)

    // 大きいgapのカードはより小さいサイズになる
    expect(resultLargeGap[0].width).toBeLessThan(resultSmallGap[0].width)
  })

  it('すべてのカードの位置が正の値', () => {
    const cards: CardRect[] = Array.from({ length: 6 }, (_, i) => ({
      id: `card-${i}`,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }))
    const result = gridLayout(cards, 1000, 800)
    for (const card of result) {
      expect(card.x).toBeGreaterThan(0)
      expect(card.y).toBeGreaterThan(0)
    }
  })
})

// --- flowLayout ---
describe('flowLayout', () => {
  it('カードなしで空配列を返す', () => {
    expect(flowLayout([], 800)).toEqual([])
  })

  it('幅に収まる分だけ横に並ぶ', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 80 },
      { id: 'b', x: 0, y: 0, width: 100, height: 80 },
    ]
    const result = flowLayout(cards, 800, 16)
    // 同じ行に並ぶ
    expect(result[0].y).toBe(result[1].y)
    expect(result[1].x).toBeGreaterThan(result[0].x)
  })

  it('溢れたら次の行に配置される', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 400, height: 100 },
      { id: 'b', x: 0, y: 0, width: 400, height: 100 },
      { id: 'c', x: 0, y: 0, width: 400, height: 100 },
    ]
    // コンテナ幅500なら1行に1つしか入らない
    const result = flowLayout(cards, 500, 16)
    expect(result[0].y).toBeLessThan(result[1].y)
    expect(result[1].y).toBeLessThan(result[2].y)
  })

  it('最初のカードは左上から配置される', () => {
    const cards: CardRect[] = [{ id: 'a', x: 99, y: 99, width: 100, height: 80 }]
    const result = flowLayout(cards, 800, 16)
    expect(result[0].x).toBe(16)
    expect(result[0].y).toBe(16)
  })
})

// --- treeLayout ---
describe('treeLayout', () => {
  it('カードなしで空配列を返す', () => {
    expect(treeLayout([], 800, 600)).toEqual([])
  })

  it('同じプロジェクトのカードは同じ列に配置される', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100, projectId: 'p1' },
      { id: 'b', x: 0, y: 0, width: 100, height: 100, projectId: 'p1' },
      { id: 'c', x: 0, y: 0, width: 100, height: 100, projectId: 'p2' },
    ]
    const result = treeLayout(cards, 800, 600)
    // p1のカードは同じx位置
    const p1Cards = result.filter(c => c.projectId === 'p1')
    expect(p1Cards[0].x).toBe(p1Cards[1].x)
    // p2のカードは異なるx位置
    const p2Card = result.find(c => c.projectId === 'p2')!
    expect(p2Card.x).not.toBe(p1Cards[0].x)
  })

  it('プロジェクトIDなしのカードもグループ化される', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100, projectId: null },
      { id: 'b', x: 0, y: 0, width: 100, height: 100, projectId: null },
    ]
    const result = treeLayout(cards, 800, 600)
    expect(result).toHaveLength(2)
    // 同じ列に配置
    expect(result[0].x).toBe(result[1].x)
  })
})

// --- findOptimalPosition ---
describe('findOptimalPosition', () => {
  it('空の状態で左上に配置', () => {
    const pos = findOptimalPosition([], { width: 100, height: 80 }, 800, 600)
    expect(pos.x).toBe(16)
    expect(pos.y).toBe(16)
  })

  it('既存カードを避けて配置', () => {
    const existing: CardRect[] = [
      { id: 'a', x: 16, y: 16, width: 200, height: 200 },
    ]
    const pos = findOptimalPosition(existing, { width: 100, height: 100 }, 800, 600)
    // 既存カードと重ならない位置
    const overlaps =
      pos.x < existing[0].x + existing[0].width &&
      pos.x + 100 > existing[0].x &&
      pos.y < existing[0].y + existing[0].height &&
      pos.y + 100 > existing[0].y
    expect(overlaps).toBe(false)
  })

  it('コンテナ内に収まる（十分なスペースがある場合）', () => {
    const pos = findOptimalPosition([], { width: 100, height: 80 }, 800, 600)
    expect(pos.x + 100).toBeLessThanOrEqual(800)
    expect(pos.y + 80).toBeLessThanOrEqual(600)
  })

  it('スペースが足りない場合は末尾に配置', () => {
    // コンテナ全体を埋めるカード
    const existing: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    ]
    // 非常に小さいコンテナ
    const pos = findOptimalPosition(existing, { width: 100, height: 100 }, 110, 110)
    expect(pos.y).toBeGreaterThanOrEqual(100)
  })
})

// --- detectOverlaps ---
describe('detectOverlaps', () => {
  it('重なりなしで空配列を返す', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 0, width: 100, height: 100 },
    ]
    expect(detectOverlaps(cards)).toEqual([])
  })

  it('部分的重なりを検出', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 50, y: 50, width: 100, height: 100 },
    ]
    const overlaps = detectOverlaps(cards)
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0]).toEqual(['a', 'b'])
  })

  it('完全重なりを検出', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 0, y: 0, width: 100, height: 100 },
    ]
    const overlaps = detectOverlaps(cards)
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0]).toEqual(['a', 'b'])
  })

  it('隣接するカード（辺が接する）は重なりでない', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 100, y: 0, width: 100, height: 100 },
    ]
    expect(detectOverlaps(cards)).toEqual([])
  })

  it('3枚のカードで複数の重なりペアを検出', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 50, y: 50, width: 100, height: 100 },
      { id: 'c', x: 80, y: 80, width: 100, height: 100 },
    ]
    const overlaps = detectOverlaps(cards)
    // a-b, a-c, b-c の3ペア
    expect(overlaps.length).toBeGreaterThanOrEqual(2)
  })

  it('カードが1枚以下なら空配列', () => {
    expect(detectOverlaps([])).toEqual([])
    expect(detectOverlaps([{ id: 'a', x: 0, y: 0, width: 100, height: 100 }])).toEqual([])
  })
})

// --- resolveOverlaps ---
describe('resolveOverlaps', () => {
  it('重なりを解消して全カードが分離される', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 50, y: 50, width: 100, height: 100 },
    ]
    const resolved = resolveOverlaps(cards, 800)
    const overlaps = detectOverlaps(resolved)
    expect(overlaps).toHaveLength(0)
  })

  it('重なりがなければ位置は変わらない', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 0, width: 100, height: 100 },
    ]
    const resolved = resolveOverlaps(cards, 800)
    expect(resolved[0].x).toBe(0)
    expect(resolved[1].x).toBe(200)
  })

  it('1枚のカードはそのまま返す', () => {
    const cards: CardRect[] = [{ id: 'a', x: 10, y: 20, width: 100, height: 100 }]
    const resolved = resolveOverlaps(cards, 800)
    expect(resolved[0].x).toBe(10)
    expect(resolved[0].y).toBe(20)
  })

  it('空配列は空配列を返す', () => {
    expect(resolveOverlaps([], 800)).toEqual([])
  })

  it('3枚の重なりも解消される', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 0, y: 0, width: 100, height: 100 },
      { id: 'c', x: 0, y: 0, width: 100, height: 100 },
    ]
    const resolved = resolveOverlaps(cards, 800)
    const overlaps = detectOverlaps(resolved)
    expect(overlaps).toHaveLength(0)
  })
})

// --- resizeToFit ---
describe('resizeToFit', () => {
  it('カードなしで空配列を返す', () => {
    expect(resizeToFit([], 800, 600, 400, 300)).toEqual([])
  })

  it('縮小時にカードが比率を保って縮小', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 100, y: 100, width: 200, height: 200 },
    ]
    const result = resizeToFit(cards, 800, 600, 400, 300)
    expect(result[0].x).toBe(50)
    expect(result[0].y).toBe(50)
    expect(result[0].width).toBe(100)
    expect(result[0].height).toBe(100)
  })

  it('拡大時にカードが比率を保って拡大', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 50, y: 50, width: 100, height: 100 },
    ]
    const result = resizeToFit(cards, 400, 300, 800, 600)
    expect(result[0].x).toBe(100)
    expect(result[0].y).toBe(100)
    expect(result[0].width).toBe(200)
    expect(result[0].height).toBe(200)
  })

  it('同じサイズなら変化なし', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 50, y: 50, width: 100, height: 100 },
    ]
    const result = resizeToFit(cards, 800, 600, 800, 600)
    expect(result[0].x).toBe(50)
    expect(result[0].y).toBe(50)
    expect(result[0].width).toBe(100)
    expect(result[0].height).toBe(100)
  })

  it('元サイズが0の場合はコピーを返す', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 50, y: 50, width: 100, height: 100 },
    ]
    const result = resizeToFit(cards, 0, 0, 800, 600)
    expect(result[0].x).toBe(50)
    expect(result[0].width).toBe(100)
  })

  it('複数カードが正しくスケールされる', () => {
    const cards: CardRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 0, width: 100, height: 100 },
    ]
    const result = resizeToFit(cards, 800, 600, 1600, 1200)
    expect(result[0].width).toBe(200)
    expect(result[1].x).toBe(400)
    expect(result[1].width).toBe(200)
  })
})

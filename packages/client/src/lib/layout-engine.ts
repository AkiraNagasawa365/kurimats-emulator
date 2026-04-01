/**
 * レイアウトエンジン
 * カードの自動配置・重なり検出・リサイズを行う純粋関数群
 */

export interface CardRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  projectId?: string | null
}

export type AutoLayoutMode = 'grid' | 'flow' | 'tree'

const DEFAULT_GAP = 16

/**
 * 2つの矩形が重なっているか判定
 */
function rectsOverlap(a: CardRect, b: CardRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/**
 * グリッド配置: 均等なグリッドに配置
 */
export function gridLayout(
  cards: CardRect[],
  containerWidth: number,
  containerHeight: number,
  gap: number = DEFAULT_GAP,
): CardRect[] {
  if (cards.length === 0) return []

  const count = cards.length
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)

  const cellWidth = (containerWidth - gap * (cols + 1)) / cols
  const cellHeight = (containerHeight - gap * (rows + 1)) / rows

  return cards.map((card, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      ...card,
      x: gap + col * (cellWidth + gap),
      y: gap + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    }
  })
}

/**
 * フロー配置: 左から右、上から下に詰める
 */
export function flowLayout(
  cards: CardRect[],
  containerWidth: number,
  gap: number = DEFAULT_GAP,
): CardRect[] {
  if (cards.length === 0) return []

  const result: CardRect[] = []
  let currentX = gap
  let currentY = gap
  let rowHeight = 0

  for (const card of cards) {
    // 現在の行に収まらない場合は次の行へ
    if (currentX + card.width > containerWidth - gap && currentX > gap) {
      currentX = gap
      currentY += rowHeight + gap
      rowHeight = 0
    }

    result.push({
      ...card,
      x: currentX,
      y: currentY,
    })

    currentX += card.width + gap
    rowHeight = Math.max(rowHeight, card.height)
  }

  return result
}

/**
 * ツリー配置: プロジェクトグループ別にツリー状配置
 */
export function treeLayout(
  cards: CardRect[],
  containerWidth: number,
  containerHeight: number,
): CardRect[] {
  if (cards.length === 0) return []

  const gap = DEFAULT_GAP

  // プロジェクトIDごとにグループ化
  const groups = new Map<string, CardRect[]>()
  for (const card of cards) {
    const key = card.projectId ?? '__ungrouped__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(card)
  }

  const groupEntries = Array.from(groups.entries())
  const groupCount = groupEntries.length

  // 各グループに水平方向のスペースを均等割り当て
  const groupWidth = (containerWidth - gap * (groupCount + 1)) / groupCount

  const result: CardRect[] = []

  groupEntries.forEach(([, groupCards], groupIndex) => {
    const groupX = gap + groupIndex * (groupWidth + gap)
    const cardHeight = (containerHeight - gap * (groupCards.length + 1)) / groupCards.length

    groupCards.forEach((card, cardIndex) => {
      result.push({
        ...card,
        x: groupX,
        y: gap + cardIndex * (cardHeight + gap),
        width: groupWidth,
        height: cardHeight,
      })
    })
  })

  return result
}

/**
 * 最適な配置位置を計算（新規カード追加時）
 * 既存カードと重ならない空きスペースを探す
 */
export function findOptimalPosition(
  existing: CardRect[],
  newCard: { width: number; height: number },
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  const gap = DEFAULT_GAP
  const stepX = 10
  const stepY = 10

  // 空の場合は左上
  if (existing.length === 0) {
    return { x: gap, y: gap }
  }

  // グリッドスキャンで空きスペースを探す
  for (let y = gap; y + newCard.height <= containerHeight - gap; y += stepY) {
    for (let x = gap; x + newCard.width <= containerWidth - gap; x += stepX) {
      const candidate: CardRect = {
        id: '__candidate__',
        x,
        y,
        width: newCard.width,
        height: newCard.height,
      }

      const hasOverlap = existing.some(card => rectsOverlap(candidate, card))
      if (!hasOverlap) {
        return { x, y }
      }
    }
  }

  // コンテナ内に収まる場所がなければ、末尾に配置
  const maxY = existing.reduce(
    (max, card) => Math.max(max, card.y + card.height),
    0,
  )
  return { x: gap, y: maxY + gap }
}

/**
 * 重なり検出: 重なっているカードのペアを返す
 */
export function detectOverlaps(cards: CardRect[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = []

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (rectsOverlap(cards[i], cards[j])) {
        overlaps.push([cards[i].id, cards[j].id])
      }
    }
  }

  return overlaps
}

/**
 * 重なり解消（押し出し）
 * 重なっているカードを右方向に押し出す。コンテナ幅を超えたら次の行へ。
 */
export function resolveOverlaps(
  cards: CardRect[],
  containerWidth: number,
): CardRect[] {
  if (cards.length <= 1) return [...cards.map(c => ({ ...c }))]

  const gap = DEFAULT_GAP
  // コピーして作業
  const result = cards.map(c => ({ ...c }))

  // x, yの順にソート
  result.sort((a, b) => a.y - b.y || a.x - b.x)

  // 各カードについて、先行カードとの重なりを解消
  let maxIterations = cards.length * cards.length
  let changed = true

  while (changed && maxIterations-- > 0) {
    changed = false
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        if (rectsOverlap(result[i], result[j])) {
          // jを右に押し出す
          result[j].x = result[i].x + result[i].width + gap

          // コンテナ幅を超えたら次の行へ
          if (result[j].x + result[j].width > containerWidth) {
            result[j].x = gap
            result[j].y = result[i].y + result[i].height + gap
          }

          changed = true
        }
      }
    }
  }

  return result
}

/**
 * コンテナサイズ変更時のリサイズ
 * カードの位置とサイズを比率を保って変換
 */
export function resizeToFit(
  cards: CardRect[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): CardRect[] {
  if (cards.length === 0) return []
  if (oldWidth === 0 || oldHeight === 0) return cards.map(c => ({ ...c }))

  const scaleX = newWidth / oldWidth
  const scaleY = newHeight / oldHeight

  return cards.map(card => ({
    ...card,
    x: card.x * scaleX,
    y: card.y * scaleY,
    width: card.width * scaleX,
    height: card.height * scaleY,
  }))
}

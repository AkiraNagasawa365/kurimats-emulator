/**
 * お気に入りアニメーションの設定・ロジック
 * framer-motionに依存しない純粋関数・定数のみ
 */

// --- アニメーション定数 ---

/** スターバーストのパーティクル数 */
export const STARBURST_PARTICLE_COUNT = 8

/** パーティクルの放射角度を計算 */
export function calculateParticleAngles(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (360 / count) * i)
}

/** パーティクルの移動先座標を計算（角度とdistanceから） */
export function calculateParticlePosition(angleDeg: number, distance: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: Math.cos(rad) * distance,
    y: Math.sin(rad) * distance,
  }
}

// --- アニメーションバリアント ---

/** スターバーストパーティクルのバリアント */
export const particleVariants = {
  initial: { scale: 0, opacity: 1, x: 0, y: 0 },
  animate: (angle: number) => {
    const pos = calculateParticlePosition(angle, 20)
    return {
      scale: [0, 1, 0],
      opacity: [1, 1, 0],
      x: pos.x,
      y: pos.y,
      transition: { duration: 0.5, ease: 'easeOut' },
    }
  },
}

/** セッションアイテムのフェードアウトバリアント */
export const fadeOutVariants = {
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  hidden: { opacity: 0, scale: 0.8, transition: { duration: 0.3 } },
}

/** お気に入りカードの集合バリアント */
export const gatherVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } },
}

/** お気に入り解除時の散開バリアント */
export const disperseVariants = {
  initial: { opacity: 1, scale: 1 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.5, x: [0, 10, -5], transition: { duration: 0.4 } },
}

/** バッジバウンスバリアント */
export const badgeBounceVariants = {
  initial: { scale: 1 },
  bounce: {
    scale: [1, 1.4, 0.9, 1.1, 1],
    transition: { duration: 0.5, ease: 'easeInOut' },
  },
}

// --- ロジック関数 ---

/** お気に入りフィルターのセッション可視性判定 */
export function isSessionVisible(isFavorite: boolean, favoritesOnly: boolean): boolean {
  return !favoritesOnly || isFavorite
}

/** バッジバウンス発火判定 */
export function shouldBadgeBounce(prevCount: number, currentCount: number): boolean {
  return currentCount !== prevCount
}

/** スターバースト発火判定（お気に入り追加時のみ） */
export function shouldStarburst(isFavorite: boolean): boolean {
  return !isFavorite
}

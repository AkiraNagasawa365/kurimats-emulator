/**
 * お気に入りアニメーションの設定・ロジック
 * framer-motionに依存しない純粋関数・定数のみ
 */

// --- アニメーション定数 ---

/** スターバーストのパーティクル数 */
export const STARBURST_PARTICLE_COUNT = 8

/**
 * お気に入りボタンの className 定数
 *
 * #143 再発防止:
 * 旧実装では非お気に入り時に `text-text-muted/30 group-hover:text-text-muted` を使用していたが、
 * 30% alpha を bg-surface-1 (#151b22) とブレンドすると実効コントラスト比 ≈ 1.44:1 となり
 * WCAG 2.1 UI コンポーネント最低 3:1 を大きく下回り、ボタンが「発見できない」状態になっていた。
 *
 * 本定数では以下を保証する:
 * - 非お気に入り: text-text-muted (#64748b) を 100% alpha で使用 (bg-surface-1 上 3.64:1)
 *   → 📁 ファイルツリーボタンと同等の視認性
 * - hover では yellow-400 に遷移し「お気に入り色のプレビュー」のセマンティクスを与える
 * - お気に入り: text-yellow-500 (明確なアクティブ色)
 *
 * group-hover: は削除した (ツールバー全体ホバーで初めて表示される挙動は #143 で否定された)。
 */
export const FAVORITE_BUTTON_CLASSES = {
  /** 非お気に入り時: 📁 と同じ text-text-muted ベース + yellow hover プレビュー */
  inactive: 'text-text-muted hover:text-yellow-400',
  /** お気に入り時: 明確な yellow アクティブ色 */
  active: 'text-yellow-500 hover:text-yellow-400',
} as const

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
      transition: { duration: 0.5, ease: 'easeOut' as const },
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
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
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
    transition: { duration: 0.5, ease: 'easeInOut' as const },
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

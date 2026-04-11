import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  STARBURST_PARTICLE_COUNT,
  calculateParticleAngles,
  calculateParticlePosition,
  particleVariants,
  fadeOutVariants,
  gatherVariants,
  disperseVariants,
  badgeBounceVariants,
  shouldStarburst,
  shouldBadgeBounce,
} from './favorite-animation-config'

// 設定・ロジックを再エクスポート（Sidebar等から参照）
export {
  STARBURST_PARTICLE_COUNT,
  calculateParticleAngles,
  calculateParticlePosition,
  particleVariants,
  fadeOutVariants,
  gatherVariants,
  disperseVariants,
  badgeBounceVariants,
} from './favorite-animation-config'

// --- コンポーネント ---

/**
 * スターバーストアニメーション
 * ★クリック時に小さな★が放射状に飛ぶエフェクト
 */
export function StarBurst({ isActive }: { isActive: boolean }) {
  if (!isActive) return null

  const angles = calculateParticleAngles(STARBURST_PARTICLE_COUNT)

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="starburst">
      {angles.map((angle, i) => (
        <motion.span
          key={i}
          custom={angle}
          variants={particleVariants}
          initial="initial"
          animate="animate"
          className="absolute top-1/2 left-1/2 text-[8px] text-yellow-400"
          style={{ marginLeft: '-4px', marginTop: '-4px' }}
          data-testid="starburst-particle"
        >
          ★
        </motion.span>
      ))}
    </div>
  )
}

/**
 * アニメーション付きお気に入りボタン
 * クリックでスターバーストを発火
 */
export function AnimatedFavoriteButton({
  isFavorite,
  onToggle,
}: {
  isFavorite: boolean
  onToggle: () => void
}) {
  const [showBurst, setShowBurst] = useState(false)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (shouldStarburst(isFavorite)) {
      // お気に入り追加時のみバーストを発火
      setShowBurst(true)
    }
    onToggle()
  }, [isFavorite, onToggle])

  useEffect(() => {
    if (showBurst) {
      const timer = setTimeout(() => setShowBurst(false), 600)
      return () => clearTimeout(timer)
    }
  }, [showBurst])

  return (
    <span
      onClick={handleClick}
      className={`relative flex-shrink-0 transition-colors cursor-pointer ${
        isFavorite
          ? 'text-yellow-500'
          : 'text-text-muted/30 group-hover:text-text-muted'
      }`}
      title={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
      data-testid="favorite-button"
    >
      <motion.span
        animate={isFavorite ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        ★
      </motion.span>
      <StarBurst isActive={showBurst} />
    </span>
  )
}

/**
 * お気に入りセッションリストのレイアウトアニメーションラッパー
 */
export function AnimatedSessionList({
  children,
  layoutId,
}: {
  children: React.ReactNode
  layoutId?: string
}) {
  return (
    <motion.div
      layout
      layoutId={layoutId}
      variants={gatherVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}

/**
 * お気に入りフィルターモードで非お気に入りをフェードアウトするラッパー
 */
export function FilterableSessionItem({
  children,
  isVisible,
  sessionId,
}: {
  children: React.ReactNode
  isVisible: boolean
  sessionId: string
}) {
  return (
    <AnimatePresence mode="popLayout">
      {isVisible && (
        <motion.div
          key={sessionId}
          layout
          variants={fadeOutVariants}
          initial="visible"
          animate="visible"
          exit="hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * お気に入りカウントバッジ（バウンスエフェクト付き）
 */
export function FavoriteBadge({ count }: { count: number }) {
  const [prevCount, setPrevCount] = useState(count)
  const [shouldBounceState, setShouldBounceState] = useState(false)

  useEffect(() => {
    if (shouldBadgeBounce(prevCount, count)) {
      setShouldBounceState(true)
      setPrevCount(count)
      const timer = setTimeout(() => setShouldBounceState(false), 600)
      return () => clearTimeout(timer)
    }
  }, [count, prevCount])

  return (
    <motion.span
      className="text-text-muted ml-auto"
      variants={badgeBounceVariants}
      animate={shouldBounceState ? 'bounce' : 'initial'}
      data-testid="favorite-badge"
    >
      {count}
    </motion.span>
  )
}

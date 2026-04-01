import { describe, it, expect } from 'vitest'
import {
  STARBURST_PARTICLE_COUNT,
  calculateParticleAngles,
  calculateParticlePosition,
  particleVariants,
  fadeOutVariants,
  gatherVariants,
  disperseVariants,
  badgeBounceVariants,
  isSessionVisible,
  shouldBadgeBounce,
  shouldStarburst,
} from '../components/animations/favorite-animation-config'

// ===================================================================
// スターバーストアニメーション - パーティクル生成ロジックテスト
// ===================================================================
describe('スターバーストアニメーション', () => {
  describe('calculateParticleAngles', () => {
    it('指定数のパーティクル角度を均等に生成する', () => {
      const angles = calculateParticleAngles(8)
      expect(angles).toHaveLength(8)
      expect(angles[0]).toBe(0)
      expect(angles[1]).toBe(45)
      expect(angles[2]).toBe(90)
      expect(angles[7]).toBe(315)
    })

    it('4パーティクルで90度刻みになる', () => {
      const angles = calculateParticleAngles(4)
      expect(angles).toEqual([0, 90, 180, 270])
    })

    it('1パーティクルの場合は0度のみ', () => {
      const angles = calculateParticleAngles(1)
      expect(angles).toEqual([0])
    })

    it('デフォルトパーティクル数は8', () => {
      expect(STARBURST_PARTICLE_COUNT).toBe(8)
    })
  })

  describe('calculateParticlePosition', () => {
    it('0度は右方向に移動する', () => {
      const pos = calculateParticlePosition(0, 20)
      expect(pos.x).toBeCloseTo(20, 5)
      expect(pos.y).toBeCloseTo(0, 5)
    })

    it('90度は下方向に移動する', () => {
      const pos = calculateParticlePosition(90, 20)
      expect(pos.x).toBeCloseTo(0, 5)
      expect(pos.y).toBeCloseTo(20, 5)
    })

    it('180度は左方向に移動する', () => {
      const pos = calculateParticlePosition(180, 20)
      expect(pos.x).toBeCloseTo(-20, 5)
      expect(pos.y).toBeCloseTo(0, 5)
    })

    it('270度は上方向に移動する', () => {
      const pos = calculateParticlePosition(270, 20)
      expect(pos.x).toBeCloseTo(0, 5)
      expect(pos.y).toBeCloseTo(-20, 5)
    })

    it('45度は右下方向に移動する', () => {
      const pos = calculateParticlePosition(45, 20)
      const expected = 20 * Math.SQRT1_2
      expect(pos.x).toBeCloseTo(expected, 5)
      expect(pos.y).toBeCloseTo(expected, 5)
    })

    it('距離0ではどの角度でも原点', () => {
      const pos = calculateParticlePosition(123, 0)
      expect(pos.x).toBeCloseTo(0)
      expect(pos.y).toBeCloseTo(0)
    })
  })
})

// ===================================================================
// アニメーションバリアント定義テスト
// ===================================================================
describe('アニメーションバリアント', () => {
  describe('particleVariants', () => {
    it('initialはscale:0, opacity:1, 位置は原点', () => {
      const { scale, opacity, x, y } = particleVariants.initial
      expect(scale).toBe(0)
      expect(opacity).toBe(1)
      expect(x).toBe(0)
      expect(y).toBe(0)
    })

    it('animateは角度に応じた位置に移動し、フェードアウトする', () => {
      const result = particleVariants.animate(0)
      // 0度: x=20, y=0
      expect(result.x).toBeCloseTo(20, 5)
      expect(result.y).toBeCloseTo(0, 5)
      // scaleはキーフレーム [0, 1, 0]
      expect(result.scale).toEqual([0, 1, 0])
      // opacityはキーフレーム [1, 1, 0]
      expect(result.opacity).toEqual([1, 1, 0])
      // durationが設定されている
      expect(result.transition.duration).toBe(0.5)
    })

    it('90度の場合、下方向に移動する', () => {
      const result = particleVariants.animate(90)
      expect(result.x).toBeCloseTo(0, 5)
      expect(result.y).toBeCloseTo(20, 5)
    })
  })

  describe('fadeOutVariants', () => {
    it('visibleはopacity:1, scale:1', () => {
      expect(fadeOutVariants.visible.opacity).toBe(1)
      expect(fadeOutVariants.visible.scale).toBe(1)
    })

    it('hiddenはopacity:0, scale:0.8', () => {
      expect(fadeOutVariants.hidden.opacity).toBe(0)
      expect(fadeOutVariants.hidden.scale).toBe(0.8)
    })

    it('hiddenのdurationは0.3秒', () => {
      expect(fadeOutVariants.hidden.transition.duration).toBe(0.3)
    })
  })

  describe('gatherVariants', () => {
    it('initialはopacity:0, y:20（下から登場）', () => {
      expect(gatherVariants.initial.opacity).toBe(0)
      expect(gatherVariants.initial.y).toBe(20)
    })

    it('animateはopacity:1, y:0（定位置）', () => {
      expect(gatherVariants.animate.opacity).toBe(1)
      expect(gatherVariants.animate.y).toBe(0)
    })

    it('exitはopacity:0, y:-10（上に退場）', () => {
      expect(gatherVariants.exit.opacity).toBe(0)
      expect(gatherVariants.exit.y).toBe(-10)
    })

    it('animateのdurationは0.4秒', () => {
      expect(gatherVariants.animate.transition.duration).toBe(0.4)
    })
  })

  describe('disperseVariants', () => {
    it('initialはopacity:1, scale:1', () => {
      expect(disperseVariants.initial.opacity).toBe(1)
      expect(disperseVariants.initial.scale).toBe(1)
    })

    it('exitはopacity:0に散開する', () => {
      expect(disperseVariants.exit.opacity).toBe(0)
      expect(disperseVariants.exit.scale).toBe(0.5)
    })

    it('exitにはx方向のキーフレームがある（散開表現）', () => {
      expect(disperseVariants.exit.x).toEqual([0, 10, -5])
    })

    it('exitのdurationは0.4秒', () => {
      expect(disperseVariants.exit.transition.duration).toBe(0.4)
    })
  })

  describe('badgeBounceVariants', () => {
    it('initialはscale:1', () => {
      expect(badgeBounceVariants.initial.scale).toBe(1)
    })

    it('bounceはscaleキーフレーム [1, 1.4, 0.9, 1.1, 1]', () => {
      expect(badgeBounceVariants.bounce.scale).toEqual([1, 1.4, 0.9, 1.1, 1])
    })

    it('bounceのdurationは0.5秒', () => {
      expect(badgeBounceVariants.bounce.transition.duration).toBe(0.5)
    })
  })
})

// ===================================================================
// お気に入りフィルターロジックテスト
// ===================================================================
describe('お気に入りフィルターロジック', () => {
  const mockSessions = [
    { id: '1', name: 'セッション1', isFavorite: true },
    { id: '2', name: 'セッション2', isFavorite: false },
    { id: '3', name: 'セッション3', isFavorite: true },
    { id: '4', name: 'セッション4', isFavorite: false },
  ]

  describe('isSessionVisible', () => {
    it('favoritesOnlyがfalseのとき、全セッションが可視', () => {
      expect(isSessionVisible(true, false)).toBe(true)
      expect(isSessionVisible(false, false)).toBe(true)
    })

    it('favoritesOnlyがtrueのとき、お気に入りのみ可視', () => {
      expect(isSessionVisible(true, true)).toBe(true)
      expect(isSessionVisible(false, true)).toBe(false)
    })
  })

  it('favoritesOnlyがfalseのとき、全セッションが表示される', () => {
    const visible = mockSessions.filter(s => isSessionVisible(s.isFavorite, false))
    expect(visible).toHaveLength(4)
  })

  it('favoritesOnlyがtrueのとき、お気に入りのみ表示される', () => {
    const visible = mockSessions.filter(s => isSessionVisible(s.isFavorite, true))
    expect(visible).toHaveLength(2)
    expect(visible.every(s => s.isFavorite)).toBe(true)
  })

  it('お気に入りがないとき、favoritesOnlyでも空配列', () => {
    const noFavorites = mockSessions.map(s => ({ ...s, isFavorite: false }))
    const visible = noFavorites.filter(s => isSessionVisible(s.isFavorite, true))
    expect(visible).toHaveLength(0)
  })

  it('全セッションがお気に入りのとき、favoritesOnlyでも全表示', () => {
    const allFavorites = mockSessions.map(s => ({ ...s, isFavorite: true }))
    const visible = allFavorites.filter(s => isSessionVisible(s.isFavorite, true))
    expect(visible).toHaveLength(4)
  })
})

// ===================================================================
// パーティクル全体のカバレッジテスト
// ===================================================================
describe('パーティクル配置の整合性', () => {
  it('デフォルト8パーティクルが360度を均等にカバーする', () => {
    const angles = calculateParticleAngles(STARBURST_PARTICLE_COUNT)
    const step = 360 / STARBURST_PARTICLE_COUNT

    for (let i = 0; i < angles.length; i++) {
      expect(angles[i]).toBe(step * i)
    }
  })

  it('全パーティクルが同じ距離に配置される', () => {
    const distance = 20
    const angles = calculateParticleAngles(STARBURST_PARTICLE_COUNT)
    const positions = angles.map(a => calculateParticlePosition(a, distance))

    for (const pos of positions) {
      const actualDistance = Math.sqrt(pos.x ** 2 + pos.y ** 2)
      expect(actualDistance).toBeCloseTo(distance, 5)
    }
  })

  it('隣接パーティクルの角度差が均等', () => {
    const angles = calculateParticleAngles(6)
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBe(60)
    }
  })
})

// ===================================================================
// バッジカウント変更検知ロジックテスト
// ===================================================================
describe('バッジカウント変更検知', () => {
  it('カウントが変化したらバウンスすべき', () => {
    expect(shouldBadgeBounce(3, 4)).toBe(true)
  })

  it('カウントが同じならバウンスしない', () => {
    expect(shouldBadgeBounce(3, 3)).toBe(false)
  })

  it('カウントが減少してもバウンスする', () => {
    expect(shouldBadgeBounce(5, 4)).toBe(true)
  })

  it('カウントが0から1に変化してもバウンスする', () => {
    expect(shouldBadgeBounce(0, 1)).toBe(true)
  })
})

// ===================================================================
// スターバーストの発火条件テスト
// ===================================================================
describe('スターバースト発火条件', () => {
  it('お気に入り追加時（false→true）にバーストが発火する', () => {
    expect(shouldStarburst(false)).toBe(true)
  })

  it('お気に入り解除時（true→false）にはバーストしない', () => {
    expect(shouldStarburst(true)).toBe(false)
  })
})

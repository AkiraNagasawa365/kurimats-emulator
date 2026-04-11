import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * v2 Phase 0: スタック最新化 + ダークテーマの検証テスト
 */

describe('v2 スタック最新化', () => {
  const clientPkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
  )
  const electronPkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../../electron/package.json'), 'utf-8')
  )

  describe('React 19', () => {
    it('react が v19 に更新されている', () => {
      const version = clientPkg.dependencies.react
      expect(version).toMatch(/^\^19/)
    })

    it('react-dom が v19 に更新されている', () => {
      const version = clientPkg.dependencies['react-dom']
      expect(version).toMatch(/^\^19/)
    })

    it('@types/react が v19 に更新されている', () => {
      const version = clientPkg.devDependencies['@types/react']
      expect(version).toMatch(/^\^19/)
    })
  })

  describe('Tailwind CSS 4', () => {
    it('tailwindcss が v4 に更新されている', () => {
      const version = clientPkg.devDependencies.tailwindcss
      expect(version).toMatch(/^\^4/)
    })

    it('@tailwindcss/vite プラグインが追加されている', () => {
      expect(clientPkg.devDependencies['@tailwindcss/vite']).toBeDefined()
    })

    it('postcss が依存から削除されている', () => {
      expect(clientPkg.devDependencies.postcss).toBeUndefined()
    })

    it('autoprefixer が依存から削除されている', () => {
      expect(clientPkg.devDependencies.autoprefixer).toBeUndefined()
    })
  })

  describe('framer-motion 12', () => {
    it('framer-motion が v12 に更新されている', () => {
      const version = clientPkg.dependencies['framer-motion']
      expect(version).toMatch(/^\^12/)
    })
  })

  describe('Electron 41', () => {
    it('electron が v41 に更新されている', () => {
      const version = electronPkg.devDependencies.electron
      expect(version).toMatch(/^[\^~]?41/)
    })
  })
})

describe('v2 ダークテーマ CSS設定', () => {
  const indexCss = readFileSync(
    resolve(__dirname, '../index.css'),
    'utf-8'
  )

  it('Tailwind 4の@import文が使われている', () => {
    expect(indexCss).toContain('@import "tailwindcss"')
  })

  it('旧@tailwindディレクティブが削除されている', () => {
    expect(indexCss).not.toContain('@tailwind base')
    expect(indexCss).not.toContain('@tailwind components')
    expect(indexCss).not.toContain('@tailwind utilities')
  })

  it('@themeブロックでカスタムカラーが定義されている', () => {
    expect(indexCss).toContain('@theme')
    expect(indexCss).toContain('--color-surface-0')
    expect(indexCss).toContain('--color-accent')
    expect(indexCss).toContain('--color-text-primary')
    expect(indexCss).toContain('--color-border')
  })

  it('ダークテーマの背景色がチャコール/スレート系である', () => {
    // surface-0がダーク系（#0fから始まる暗い色）
    expect(indexCss).toMatch(/--color-surface-0:\s*#0f/)
  })

  it('アクセントカラーがティール系である', () => {
    // accent がティール/グリーン系
    expect(indexCss).toMatch(/--color-accent:\s*#2dd4bf/)
  })

  it('モノスペースフォントが設定されている', () => {
    expect(indexCss).toContain('SF Mono')
    expect(indexCss).toContain('monospace')
  })

  it('タイル用カラーが定義されている', () => {
    expect(indexCss).toContain('--color-tile-bg')
    expect(indexCss).toContain('--color-tile-header')
    expect(indexCss).toContain('--color-tile-border')
  })

  // #175 の再発防止:
  // surface-N は純粋な elevation ラダーでなければならない（N が大きいほど明るい）。
  // 過去に surface-1 (#0b0f13) が surface-0 (#0f1419) より暗く設定されており、
  // ペインツールバーが視覚的に消えるバグ (#165 -> #175) が発生した。
  describe('surface カラースケールが luminance 昇順のラダーになっている', () => {
    /** #rrggbb を相対輝度 (WCAG 相当の簡易版) に変換する */
    function parseLuminance(hex: string): number {
      const m = hex.match(/^#([0-9a-f]{6})$/i)
      if (!m) throw new Error(`invalid hex: ${hex}`)
      const n = parseInt(m[1], 16)
      const r = ((n >> 16) & 0xff) / 255
      const g = ((n >> 8) & 0xff) / 255
      const b = (n & 0xff) / 255
      // sRGB → 線形化してから Rec.709 重み付けで輝度を求める
      const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    /** index.css から --color-<name> の #rrggbb 値を抽出 */
    function extractColor(css: string, name: string): string {
      const re = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i')
      const m = css.match(re)
      if (!m) throw new Error(`token not found: ${name}`)
      return m[1]
    }

    it('surface-0 < surface-1 < surface-2 < surface-3 の luminance 順である', () => {
      const s0 = parseLuminance(extractColor(indexCss, 'surface-0'))
      const s1 = parseLuminance(extractColor(indexCss, 'surface-1'))
      const s2 = parseLuminance(extractColor(indexCss, 'surface-2'))
      const s3 = parseLuminance(extractColor(indexCss, 'surface-3'))
      expect(s1).toBeGreaterThan(s0)
      expect(s2).toBeGreaterThan(s1)
      expect(s3).toBeGreaterThan(s2)
    })

    it('dark chrome 用途のトークン --color-chrome が定義されている', () => {
      // Sidebar/ActivityBar/StatusBar/Overlay 等の content より暗い shell 色は
      // surface ラダーから独立した chrome トークンで扱う
      expect(indexCss).toMatch(/--color-chrome:\s*#[0-9a-f]{6}/i)
    })

    it('--color-chrome は surface-0 (content bg) より暗い', () => {
      const content = parseLuminance(extractColor(indexCss, 'surface-0'))
      const chrome = parseLuminance(extractColor(indexCss, 'chrome'))
      expect(chrome).toBeLessThan(content)
    })
  })
})

describe('v2 アニメーション設定のframer-motion v12互換性', () => {
  // framer-motion v12ではease型が厳密化されたため、
  // 'as const' でリテラル型にする必要がある
  it('particleVariantsのeaseがリテラル型である', async () => {
    const { particleVariants } = await import('../components/animations/favorite-animation-config')
    const result = particleVariants.animate(0)
    expect(result.transition.ease).toBe('easeOut')
  })

  it('gatherVariantsのeaseがリテラル型である', async () => {
    const { gatherVariants } = await import('../components/animations/favorite-animation-config')
    const animate = gatherVariants.animate as { transition: { ease: string } }
    expect(animate.transition.ease).toBe('easeOut')
  })

  it('badgeBounceVariantsのeaseがリテラル型である', async () => {
    const { badgeBounceVariants } = await import('../components/animations/favorite-animation-config')
    const bounce = badgeBounceVariants.bounce as { transition: { ease: string } }
    expect(bounce.transition.ease).toBe('easeInOut')
  })
})

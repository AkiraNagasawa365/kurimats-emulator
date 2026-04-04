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
      expect(version).toMatch(/^\^41/)
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

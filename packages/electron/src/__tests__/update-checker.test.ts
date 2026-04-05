import { describe, it, expect } from 'vitest'
import { extractVersion, compareVersions } from '../update-checker'

describe('update-checker', () => {
  describe('extractVersion', () => {
    it('タグからバージョンを抽出する', () => {
      expect(extractVersion('v0.2.0-abc1234')).toBe('0.2.0')
    })

    it('vプレフィックスのみのタグ', () => {
      expect(extractVersion('v1.0.0')).toBe('1.0.0')
    })

    it('プレフィックスなしのタグ', () => {
      expect(extractVersion('0.3.1')).toBe('0.3.1')
    })

    it('SHA付きタグ', () => {
      expect(extractVersion('v0.1.0-a1b2c3d')).toBe('0.1.0')
    })
  })

  describe('compareVersions', () => {
    it('同一バージョンは0を返す', () => {
      expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    })

    it('メジャーバージョンが大きい場合は正を返す', () => {
      expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
    })

    it('マイナーバージョンが大きい場合は正を返す', () => {
      expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0)
    })

    it('パッチバージョンが大きい場合は正を返す', () => {
      expect(compareVersions('0.1.1', '0.1.0')).toBeGreaterThan(0)
    })

    it('古いバージョンは負を返す', () => {
      expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
    })

    it('桁数が異なる場合も比較できる', () => {
      expect(compareVersions('1.0', '0.9.9')).toBeGreaterThan(0)
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { hasValidSize, safeFit } from '../utils/terminal-utils'

describe('ターミナル safeFit ユーティリティ', () => {
  describe('hasValidSize', () => {
    it('幅と高さが正の値なら true を返す', () => {
      const el = { clientWidth: 100, clientHeight: 50 } as HTMLElement
      expect(hasValidSize(el)).toBe(true)
    })

    it('幅が0なら false を返す', () => {
      const el = { clientWidth: 0, clientHeight: 50 } as HTMLElement
      expect(hasValidSize(el)).toBe(false)
    })

    it('高さが0なら false を返す', () => {
      const el = { clientWidth: 100, clientHeight: 0 } as HTMLElement
      expect(hasValidSize(el)).toBe(false)
    })

    it('幅と高さの両方が0なら false を返す', () => {
      const el = { clientWidth: 0, clientHeight: 0 } as HTMLElement
      expect(hasValidSize(el)).toBe(false)
    })
  })

  describe('safeFit', () => {
    it('コンテナサイズが有効な場合、fit() を呼ぶ', () => {
      const mockFitAddon = { fit: vi.fn() }
      const container = { clientWidth: 200, clientHeight: 100 } as HTMLElement

      safeFit(mockFitAddon as any, container)

      expect(mockFitAddon.fit).toHaveBeenCalledOnce()
    })

    it('コンテナサイズが0の場合、fit() を呼ばない', () => {
      const mockFitAddon = { fit: vi.fn() }
      const container = { clientWidth: 0, clientHeight: 0 } as HTMLElement

      safeFit(mockFitAddon as any, container)

      expect(mockFitAddon.fit).not.toHaveBeenCalled()
    })

    it('fit() がエラーを投げても例外が伝播しない', () => {
      const mockFitAddon = {
        fit: vi.fn().mockImplementation(() => {
          throw new Error('dimensions エラー')
        }),
      }
      const container = { clientWidth: 200, clientHeight: 100 } as HTMLElement

      expect(() => safeFit(mockFitAddon as any, container)).not.toThrow()
    })

    it('幅だけ0の場合、fit() を呼ばない', () => {
      const mockFitAddon = { fit: vi.fn() }
      const container = { clientWidth: 0, clientHeight: 100 } as HTMLElement

      safeFit(mockFitAddon as any, container)

      expect(mockFitAddon.fit).not.toHaveBeenCalled()
    })
  })
})

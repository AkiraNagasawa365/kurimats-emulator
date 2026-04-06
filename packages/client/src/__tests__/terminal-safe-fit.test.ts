import { describe, it, expect, vi } from 'vitest'
import { hasValidSize, safeFit, getCellDimensions } from '../utils/terminal-utils'

/** hasValidSizeテスト用のHTMLElementモック */
function mockElement(clientWidth: number, clientHeight: number, rectWidth?: number, rectHeight?: number): HTMLElement {
  return {
    clientWidth,
    clientHeight,
    getBoundingClientRect: () => ({
      width: rectWidth ?? clientWidth,
      height: rectHeight ?? clientHeight,
      x: 0, y: 0, top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => {},
    }),
  } as unknown as HTMLElement
}

describe('ターミナル safeFit ユーティリティ', () => {
  describe('hasValidSize', () => {
    it('幅と高さが正の値なら true を返す', () => {
      expect(hasValidSize(mockElement(100, 50))).toBe(true)
    })

    it('幅が0なら false を返す', () => {
      expect(hasValidSize(mockElement(0, 50))).toBe(false)
    })

    it('高さが0なら false を返す', () => {
      expect(hasValidSize(mockElement(100, 0))).toBe(false)
    })

    it('幅と高さの両方が0なら false を返す', () => {
      expect(hasValidSize(mockElement(0, 0))).toBe(false)
    })

    it('clientWidthは正だがgetBoundingClientRectが0の場合はfalseを返す', () => {
      expect(hasValidSize(mockElement(100, 50, 0, 0))).toBe(false)
    })

    it('getBoundingClientRectの幅だけ0の場合はfalseを返す', () => {
      expect(hasValidSize(mockElement(100, 50, 0, 50))).toBe(false)
    })
  })

  describe('safeFit', () => {
    it('コンテナサイズが有効な場合、fit() を呼ぶ', () => {
      const mockFitAddon = { fit: vi.fn() }
      safeFit(mockFitAddon as any, mockElement(200, 100))
      expect(mockFitAddon.fit).toHaveBeenCalledOnce()
    })

    it('コンテナサイズが0の場合、fit() を呼ばない', () => {
      const mockFitAddon = { fit: vi.fn() }
      safeFit(mockFitAddon as any, mockElement(0, 0))
      expect(mockFitAddon.fit).not.toHaveBeenCalled()
    })

    it('fit() がエラーを投げても例外が伝播しない', () => {
      const mockFitAddon = {
        fit: vi.fn().mockImplementation(() => {
          throw new Error('dimensions エラー')
        }),
      }
      expect(() => safeFit(mockFitAddon as any, mockElement(200, 100))).not.toThrow()
    })

    it('幅だけ0の場合、fit() を呼ばない', () => {
      const mockFitAddon = { fit: vi.fn() }
      safeFit(mockFitAddon as any, mockElement(0, 100))
      expect(mockFitAddon.fit).not.toHaveBeenCalled()
    })
  })

  describe('getCellDimensions', () => {
    it('内部APIが存在する場合はセル寸法を返す', () => {
      const mockTerm = {
        _core: {
          _renderService: {
            dimensions: {
              css: {
                cell: { width: 8.5, height: 17 },
              },
            },
          },
        },
      }
      expect(getCellDimensions(mockTerm)).toEqual({ width: 8.5, height: 17 })
    })

    it('内部APIが存在しない場合はnullを返す', () => {
      expect(getCellDimensions({})).toBeNull()
    })

    it('nullを渡してもnullを返す', () => {
      expect(getCellDimensions(null)).toBeNull()
    })

    it('_coreが不完全な場合はnullを返す', () => {
      expect(getCellDimensions({ _core: {} })).toBeNull()
    })
  })
})

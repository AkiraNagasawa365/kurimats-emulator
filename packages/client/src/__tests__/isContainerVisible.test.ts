import { describe, it, expect } from 'vitest'

/**
 * isContainerVisible ロジックテスト
 * ズーム中に隠れたペインのResizeObserverが不正なfit()を呼ぶのを防ぐ
 *
 * node環境ではgetComputedStyleが存在しないため、
 * 関数ロジックを直接テストする
 */

/** isContainerVisibleのロジック再現（terminal-utils.tsと同一） */
function isContainerVisible(element: { parentElement: unknown | null }, getComputedStyleFn?: (el: unknown) => { pointerEvents: string }): boolean {
  if (typeof getComputedStyleFn !== 'function') return true
  let el: { parentElement: unknown | null } | null = element
  while (el) {
    try {
      if (getComputedStyleFn(el).pointerEvents === 'none') return false
    } catch {
      return true
    }
    el = (el as { parentElement: { parentElement: unknown | null } | null }).parentElement
  }
  return true
}

describe('isContainerVisible ロジック', () => {
  it('getComputedStyleが使えない場合はtrueを返す', () => {
    const el = { parentElement: null }
    expect(isContainerVisible(el, undefined)).toBe(true)
  })

  it('pointer-events: noneの要素はfalseを返す', () => {
    const el = { parentElement: null }
    const mockGCS = () => ({ pointerEvents: 'none' })
    expect(isContainerVisible(el, mockGCS)).toBe(false)
  })

  it('pointer-events: autoの要素はtrueを返す', () => {
    const el = { parentElement: null }
    const mockGCS = () => ({ pointerEvents: 'auto' })
    expect(isContainerVisible(el, mockGCS)).toBe(true)
  })

  it('祖先にpointer-events: noneがある場合falseを返す', () => {
    const grandparent = { parentElement: null, _pe: 'none' }
    const parent = { parentElement: grandparent, _pe: 'auto' }
    const el = { parentElement: parent, _pe: 'auto' }

    const mockGCS = (e: { _pe: string }) => ({ pointerEvents: e._pe })
    expect(isContainerVisible(el, mockGCS as any)).toBe(false)
  })

  it('祖先が全てpointer-events: autoならtrueを返す', () => {
    const parent = { parentElement: null, _pe: 'auto' }
    const el = { parentElement: parent, _pe: 'auto' }

    const mockGCS = (e: { _pe: string }) => ({ pointerEvents: e._pe })
    expect(isContainerVisible(el, mockGCS as any)).toBe(true)
  })

  it('getComputedStyleがエラーを投げてもクラッシュしない', () => {
    const el = { parentElement: null }
    const throwingGCS = () => { throw new Error('mock error') }
    expect(isContainerVisible(el, throwingGCS as any)).toBe(true)
  })
})

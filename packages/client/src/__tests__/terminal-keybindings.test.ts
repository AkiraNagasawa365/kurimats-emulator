import { describe, it, expect } from 'vitest'
import { macKeyEventToSequence } from '../utils/terminal-keybindings'

/**
 * テスト用のイベント生成ヘルパー
 * macKeyEventToSequenceはtype/metaKey/altKey/ctrlKey/keyしか参照しないため、
 * jsdom環境なしでプレーンオブジェクトをキャストして注入する
 */
function makeEvent(init: {
  key: string
  type?: 'keydown' | 'keyup'
  metaKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}): KeyboardEvent {
  return {
    type: init.type ?? 'keydown',
    key: init.key,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
  } as unknown as KeyboardEvent
}

describe('macKeyEventToSequence', () => {
  describe('Cmd修飾子（行単位操作）', () => {
    it('Cmd+Backspace → Ctrl+U (\\x15) 行頭まで削除', () => {
      const ev = makeEvent({ key: 'Backspace', metaKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x15')
    })

    it('Cmd+ArrowLeft → Ctrl+A (\\x01) 行頭へ', () => {
      const ev = makeEvent({ key: 'ArrowLeft', metaKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x01')
    })

    it('Cmd+ArrowRight → Ctrl+E (\\x05) 行末へ', () => {
      const ev = makeEvent({ key: 'ArrowRight', metaKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x05')
    })

    it('Cmd+Shift+Backspace（Shift併用）も行頭まで削除', () => {
      // Shiftはテキスト選択扱いではあるが、xtermバッファ上は選択状態ではないので
      // 保守的にCmd+Backspaceと同じシーケンスを返す（ユーザー体感優先）
      const ev = makeEvent({ key: 'Backspace', metaKey: true, shiftKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x15')
    })

    it('Cmd+任意文字キーは対象外', () => {
      const ev = makeEvent({ key: 'c', metaKey: true })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })
  })

  describe('Opt修飾子（単語単位操作）', () => {
    it('Opt+Backspace → Ctrl+W (\\x17) 単語削除', () => {
      const ev = makeEvent({ key: 'Backspace', altKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x17')
    })

    it('Opt+ArrowLeft → ESC+b (\\x1bb) 前単語へ', () => {
      const ev = makeEvent({ key: 'ArrowLeft', altKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x1bb')
    })

    it('Opt+ArrowRight → ESC+f (\\x1bf) 次単語へ', () => {
      const ev = makeEvent({ key: 'ArrowRight', altKey: true })
      expect(macKeyEventToSequence(ev, true)).toBe('\x1bf')
    })

    it('Opt+文字キー（å入力）は委譲する', () => {
      // xtermのデフォルト挙動で特殊文字入力させたいのでnullを返す
      const ev = makeEvent({ key: 'b', altKey: true })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })
  })

  describe('プラットフォーム/イベント種別の除外', () => {
    it('isMac=falseでは常にnull（Cmd+Backspace）', () => {
      const ev = makeEvent({ key: 'Backspace', metaKey: true })
      expect(macKeyEventToSequence(ev, false)).toBeNull()
    })

    it('isMac=falseでは常にnull（Opt+ArrowLeft）', () => {
      const ev = makeEvent({ key: 'ArrowLeft', altKey: true })
      expect(macKeyEventToSequence(ev, false)).toBeNull()
    })

    it('keyupイベントは対象外', () => {
      const ev = makeEvent({ key: 'Backspace', metaKey: true, type: 'keyup' })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })
  })

  describe('修飾子なし/複合修飾子', () => {
    it('修飾子なしBackspaceは委譲（通常の1文字削除）', () => {
      const ev = makeEvent({ key: 'Backspace' })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })

    it('Cmd+Ctrl+Backspace（複合）は対象外', () => {
      const ev = makeEvent({ key: 'Backspace', metaKey: true, ctrlKey: true })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })

    it('Cmd+Opt+Backspace（複合）は対象外', () => {
      const ev = makeEvent({ key: 'Backspace', metaKey: true, altKey: true })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })

    it('Ctrl+Backspace単独は対象外（Ctrlはxtermネイティブで処理される）', () => {
      const ev = makeEvent({ key: 'Backspace', ctrlKey: true })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })

    it('修飾子なしArrowLeftは委譲', () => {
      const ev = makeEvent({ key: 'ArrowLeft' })
      expect(macKeyEventToSequence(ev, true)).toBeNull()
    })
  })
})

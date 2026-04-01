import { describe, it, expect } from 'vitest'
import type { ClientTerminalMessage, ServerTerminalMessage } from '@kurimats/shared'

describe('プロトコル型定義', () => {
  describe('ClientTerminalMessage', () => {
    it('inputメッセージの構造が正しい', () => {
      const msg: ClientTerminalMessage = { type: 'input', data: 'hello' }
      expect(msg.type).toBe('input')
      expect(msg.data).toBe('hello')
    })

    it('resizeメッセージの構造が正しい', () => {
      const msg: ClientTerminalMessage = { type: 'resize', cols: 120, rows: 30 }
      expect(msg.type).toBe('resize')
      expect(msg.cols).toBe(120)
      expect(msg.rows).toBe(30)
    })

    it('resizeメッセージにcols/rowsが必要', () => {
      const msg: ClientTerminalMessage = { type: 'resize', cols: 80, rows: 24 }
      expect(msg).toHaveProperty('cols')
      expect(msg).toHaveProperty('rows')
      expect(typeof msg.cols).toBe('number')
      expect(typeof msg.rows).toBe('number')
    })
  })

  describe('ServerTerminalMessage', () => {
    it('outputメッセージの構造が正しい', () => {
      const msg: ServerTerminalMessage = { type: 'output', data: 'hello' }
      expect(msg.type).toBe('output')
    })

    it('exitメッセージの構造が正しい', () => {
      const msg: ServerTerminalMessage = { type: 'exit', code: 0 }
      expect(msg.type).toBe('exit')
      expect(msg.code).toBe(0)
    })

    it('connectedメッセージの構造が正しい', () => {
      const msg: ServerTerminalMessage = { type: 'connected', sessionId: 'abc' }
      expect(msg.type).toBe('connected')
      expect(msg.sessionId).toBe('abc')
    })

    it('errorメッセージの構造が正しい', () => {
      const msg: ServerTerminalMessage = { type: 'error', message: 'エラー' }
      expect(msg.type).toBe('error')
      expect(msg.message).toBe('エラー')
    })
  })
})

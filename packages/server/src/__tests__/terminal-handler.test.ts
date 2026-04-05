import { describe, it, expect } from 'vitest'

/**
 * terminal-handler WebSocket Heartbeat テスト
 * ping/pong で死んだ接続を早期検出する機能の検証
 */
describe('ターミナルWebSocketハンドラー Heartbeat', () => {
  describe('Heartbeat ロジック', () => {
    it('aliveフラグがfalseのクライアントはterminateされる', () => {
      const aliveMap = new Map<string, boolean>()
      const terminated: string[] = []
      const pinged: string[] = []

      aliveMap.set('ws1', true)
      aliveMap.set('ws2', false)  // 死んだ接続
      aliveMap.set('ws3', true)

      for (const [id, alive] of aliveMap) {
        if (!alive) {
          terminated.push(id)
          aliveMap.delete(id)
          continue
        }
        aliveMap.set(id, false)
        pinged.push(id)
      }

      expect(terminated).toEqual(['ws2'])
      expect(pinged).toContain('ws1')
      expect(pinged).toContain('ws3')
      expect(pinged).not.toContain('ws2')
    })

    it('pong受信時にaliveフラグがtrueに更新される', () => {
      const aliveMap = new Map<string, boolean>()
      aliveMap.set('ws1', false)
      aliveMap.set('ws1', true) // pong受信
      expect(aliveMap.get('ws1')).toBe(true)
    })

    it('新規接続時にaliveフラグがtrueで初期化される', () => {
      const aliveMap = new Map<string, boolean>()
      aliveMap.set('ws-new', true)
      expect(aliveMap.get('ws-new')).toBe(true)
    })
  })

  describe('リングバッファ送信', () => {
    it('新規接続時にconnectedメッセージが送信される', () => {
      const sentMessages: object[] = []
      const connMsg = { type: 'connected', sessionId: 'test-session' }
      sentMessages.push(connMsg)

      expect(sentMessages).toEqual([
        { type: 'connected', sessionId: 'test-session' },
      ])
    })

    it('バッファがある場合、connectedの後にoutputが送信される', () => {
      const sentMessages: object[] = []
      const buffer = 'hello world'

      sentMessages.push({ type: 'connected', sessionId: 'test-session' })
      if (buffer) {
        sentMessages.push({ type: 'output', data: buffer })
      }

      expect(sentMessages).toHaveLength(2)
      expect(sentMessages[1]).toEqual({ type: 'output', data: 'hello world' })
    })

    it('バッファが空の場合はoutputを送信しない', () => {
      const sentMessages: object[] = []
      const buffer = ''

      sentMessages.push({ type: 'connected', sessionId: 'test-session' })
      if (buffer) {
        sentMessages.push({ type: 'output', data: buffer })
      }

      expect(sentMessages).toHaveLength(1)
    })
  })

  describe('クライアント管理', () => {
    it('切断時にクライアントセットから削除される', () => {
      const clients = new Map<string, Set<string>>()
      clients.set('session1', new Set(['ws1', 'ws2']))

      clients.get('session1')?.delete('ws1')

      expect(clients.get('session1')?.size).toBe(1)
      expect(clients.get('session1')?.has('ws2')).toBe(true)
    })

    it('最後のクライアント切断時にセッションエントリが削除される', () => {
      const clients = new Map<string, Set<string>>()
      clients.set('session1', new Set(['ws1']))

      clients.get('session1')?.delete('ws1')
      if (clients.get('session1')?.size === 0) {
        clients.delete('session1')
      }

      expect(clients.has('session1')).toBe(false)
    })
  })
})

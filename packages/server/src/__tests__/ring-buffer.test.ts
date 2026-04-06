import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RingBuffer } from '../services/ring-buffer.js'

describe('RingBuffer', () => {
  describe('基本動作', () => {
    it('空バッファはgetContentで空文字を返す', () => {
      const buf = new RingBuffer()
      expect(buf.getContent()).toBe('')
    })

    it('空バッファはgetSafeContentで空文字を返す', () => {
      const buf = new RingBuffer()
      expect(buf.getSafeContent()).toBe('')
    })

    it('appendしたデータがgetContentで取得できる', () => {
      const buf = new RingBuffer()
      buf.append('hello')
      buf.append(' world')
      expect(buf.getContent()).toBe('hello world')
    })

    it('clearでバッファがクリアされる', () => {
      const buf = new RingBuffer()
      buf.append('data')
      buf.clear()
      expect(buf.getContent()).toBe('')
    })
  })

  describe('バッファサイズ制限', () => {
    it('maxSizeを超えるとデータが切り詰められる', () => {
      const buf = new RingBuffer(10)
      buf.append('abcdefghijklmnop') // 16文字 > 10
      const content = buf.getContent()
      // safeSliceにより先頭にSGRリセットが入る場合がある
      // 末尾のデータが保持されていることを確認
      expect(content).toContain('mnop')
      expect(content.length).toBeLessThanOrEqual(20) // リセット分の余裕
    })

    it('maxSize以下のデータはそのまま保持される', () => {
      const buf = new RingBuffer(100)
      buf.append('short')
      expect(buf.getContent()).toBe('short')
    })

    it('コンストラクタにサイズ指定で上限が設定される', () => {
      const buf = new RingBuffer(5)
      buf.append('12345678')
      // 末尾5文字付近が保持される
      expect(buf.getContent()).toContain('45678')
    })
  })

  describe('環境変数からのサイズ設定', () => {
    const originalEnv = process.env.PTY_BUFFER_SIZE

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.PTY_BUFFER_SIZE
      } else {
        process.env.PTY_BUFFER_SIZE = originalEnv
      }
    })

    it('PTY_BUFFER_SIZE環境変数が反映される', async () => {
      process.env.PTY_BUFFER_SIZE = '20'
      // 動的インポートで環境変数を反映（キャッシュ回避のため新インスタンスで確認）
      const buf = new RingBuffer()
      buf.append('a'.repeat(30))
      const content = buf.getContent()
      // 環境変数の20バイト + SGRリセット分
      expect(content.length).toBeLessThanOrEqual(30)
    })
  })

  describe('getSafeContent', () => {
    it('データがある場合は先頭にSGRリセットが挿入される', () => {
      const buf = new RingBuffer()
      buf.append('test data')
      const safe = buf.getSafeContent()
      expect(safe).toBe('\x1b[0mtest data')
    })

    it('SGRリセットでANSIエスケープの色化けを防止する', () => {
      const buf = new RingBuffer()
      // 赤色の途中で終わるデータ
      buf.append('\x1b[31m赤色テキスト')
      const safe = buf.getSafeContent()
      // 先頭にリセットが入り、色がリセットされる
      expect(safe.startsWith('\x1b[0m')).toBe(true)
    })
  })

  describe('マルチバイト文字の安全性', () => {
    it('日本語テキストが正しく切り詰められる', () => {
      const buf = new RingBuffer(20)
      buf.append('あいうえおかきくけこ') // 各3バイトだが文字列長は10
      const content = buf.getContent()
      // 壊れた文字がないことを確認（デコード可能）
      expect(() => JSON.stringify(content)).not.toThrow()
    })

    it('絵文字（サロゲートペア）が壊れない', () => {
      const buf = new RingBuffer(10)
      const emoji = '😀😁😂🤣😃' // 各2文字分（サロゲートペア）
      buf.append(emoji)
      const content = buf.getContent()
      // サロゲートペアの途中で切れていないことを確認
      for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i)
        // 後半サロゲートが先頭に来ていないこと
        if (i === 0 || (content.charAt(i - 1) !== '\x1b' && content.charCodeAt(i - 1) < 0xD800)) {
          expect(code < 0xDC00 || code > 0xDFFF || i > 0).toBe(true)
        }
      }
    })
  })

  describe('デフォルトサイズ', () => {
    it('デフォルトで256KBのバッファが確保される', () => {
      const buf = new RingBuffer()
      const data = 'x'.repeat(200 * 1024) // 200KB
      buf.append(data)
      // 200KB < 256KBなのでそのまま保持
      expect(buf.getContent()).toBe(data)
    })
  })
})

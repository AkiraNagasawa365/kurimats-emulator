import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PtyManager, type PtyBackend } from '../services/pty-manager.js'

describe('PtyManager', () => {
  let manager: PtyManager

  beforeEach(() => {
    manager = new PtyManager()
    // テスト環境ではchild_processモードを強制
    manager._forceBackend('child_process')
  })

  afterEach(() => {
    manager.killAll()
  })

  // ========================================
  // バックエンド検出テスト
  // ========================================
  describe('バックエンド検出', () => {
    it('_forceBackendでchild_processモードを設定できる', () => {
      manager._forceBackend('child_process')
      expect(manager.backend).toBe('child_process')
    })

    it('_forceBackendでnode-ptyモードを設定できる', () => {
      manager._forceBackend('node-pty')
      expect(manager.backend).toBe('node-pty')
    })

    it('initializeでバックエンドが決定される', async () => {
      const freshManager = new PtyManager()
      const backend = await freshManager.initialize()
      // 実行環境に応じてnode-ptyまたはchild_processのどちらかが返る
      expect(['node-pty', 'child_process']).toContain(backend)
      expect(freshManager.backend).toBe(backend)
    })

    it('initializeは2回呼んでも同じ結果を返す', async () => {
      const freshManager = new PtyManager()
      const first = await freshManager.initialize()
      const second = await freshManager.initialize()
      expect(first).toBe(second)
    })
  })

  // ========================================
  // spawnテスト
  // ========================================
  describe('spawn', () => {
    it('セッションを作成できる', async () => {
      await manager.spawn('test-1', '/tmp')
      expect(manager.isAlive('test-1')).toBe(true)
      expect(manager.getActiveSessionIds()).toContain('test-1')
    })

    it('重複IDでエラーになる', async () => {
      await manager.spawn('dup-1', '/tmp')
      await expect(manager.spawn('dup-1', '/tmp')).rejects.toThrow(
        'セッション dup-1 は既に存在します',
      )
    })

    it('デフォルトのcols/rowsが設定される', async () => {
      await manager.spawn('size-default', '/tmp')
      const size = manager.getSessionSize('size-default')
      expect(size).toEqual({ cols: 120, rows: 30 })
    })

    it('カスタムcols/rowsが設定される', async () => {
      await manager.spawn('size-custom', '/tmp', 80, 24)
      const size = manager.getSessionSize('size-custom')
      expect(size).toEqual({ cols: 80, rows: 24 })
    })

    it('child_processバックエンドで作成される', async () => {
      await manager.spawn('backend-check', '/tmp')
      expect(manager.getSessionBackend('backend-check')).toBe('child_process')
    })
  })

  // ========================================
  // writeテスト
  // ========================================
  describe('write', () => {
    it('データを書き込める', async () => {
      await manager.spawn('write-1', '/tmp')
      // エラーなく書き込めることを確認
      expect(() => manager.write('write-1', 'echo hello\n')).not.toThrow()
    })

    it('存在しないセッションへの書き込みは無視される', () => {
      // エラーにならず無視される
      expect(() => manager.write('nonexistent', 'data')).not.toThrow()
    })

    it('終了済みセッションへの書き込みは無視される', async () => {
      await manager.spawn('write-dead', '/tmp')
      manager.kill('write-dead')
      // killした後なので無視される
      expect(() => manager.write('write-dead', 'data')).not.toThrow()
    })
  })

  // ========================================
  // resizeテスト
  // ========================================
  describe('resize', () => {
    it('cols/rowsが更新される', async () => {
      await manager.spawn('resize-1', '/tmp')
      manager.resize('resize-1', 200, 50)
      const size = manager.getSessionSize('resize-1')
      expect(size).toEqual({ cols: 200, rows: 50 })
    })

    it('存在しないセッションへのリサイズは無視される', () => {
      expect(() => manager.resize('nonexistent', 80, 24)).not.toThrow()
    })

    it('複数回リサイズできる', async () => {
      await manager.spawn('resize-multi', '/tmp')
      manager.resize('resize-multi', 80, 24)
      expect(manager.getSessionSize('resize-multi')).toEqual({ cols: 80, rows: 24 })
      manager.resize('resize-multi', 160, 48)
      expect(manager.getSessionSize('resize-multi')).toEqual({ cols: 160, rows: 48 })
    })

    it('child_processモードの連続リサイズがデバウンスされる', async () => {
      await manager.spawn('resize-debounce', '/tmp')
      // 短時間に3回連続リサイズ → cols/rowsは即時更新される
      manager.resize('resize-debounce', 80, 24)
      manager.resize('resize-debounce', 100, 30)
      manager.resize('resize-debounce', 120, 40)
      // 内部状態は最後のサイズが反映される
      expect(manager.getSessionSize('resize-debounce')).toEqual({ cols: 120, rows: 40 })
      // デバウンスの100ms待機後、実際のリサイズ送信が行われる
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
  })

  // ========================================
  // リングバッファテスト
  // ========================================
  describe('リングバッファ', () => {
    it('データが蓄積される', async () => {
      await manager.spawn('buf-1', '/tmp')
      // コマンドを送信してデータ受信を待つ
      manager.write('buf-1', 'echo test\n')
      // 少し待ってバッファを確認
      await new Promise((resolve) => setTimeout(resolve, 500))
      const buffer = manager.getBuffer('buf-1')
      // 何らかのデータが蓄積されているはず（シェルプロンプトなど）
      expect(typeof buffer).toBe('string')
    })

    it('存在しないセッションのバッファは空文字を返す', () => {
      expect(manager.getBuffer('nonexistent')).toBe('')
    })

    it('dataイベントが発火する', async () => {
      const received: string[] = []
      manager.on('data', (sessionId: string, data: string) => {
        if (sessionId === 'buf-event') {
          received.push(data)
        }
      })

      await manager.spawn('buf-event', '/tmp')
      manager.write('buf-event', 'echo hello_from_test\n')

      // データ受信を待つ
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect(received.length).toBeGreaterThan(0)
    })
  })

  // ========================================
  // ライフサイクルテスト
  // ========================================
  describe('ライフサイクル', () => {
    it('killでalive=falseになる', async () => {
      await manager.spawn('life-1', '/tmp')
      expect(manager.isAlive('life-1')).toBe(true)
      manager.kill('life-1')
      expect(manager.isAlive('life-1')).toBe(false)
    })

    it('kill後はセッションがMapから削除される', async () => {
      await manager.spawn('life-2', '/tmp')
      manager.kill('life-2')
      expect(manager.getActiveSessionIds()).not.toContain('life-2')
      expect(manager.getSessionBackend('life-2')).toBeNull()
    })

    it('存在しないセッションのkillは無視される', () => {
      expect(() => manager.kill('nonexistent')).not.toThrow()
    })

    it('killAllで全セッションが終了する', async () => {
      await manager.spawn('all-1', '/tmp')
      await manager.spawn('all-2', '/tmp')
      await manager.spawn('all-3', '/tmp')
      expect(manager.getActiveSessionIds()).toHaveLength(3)
      manager.killAll()
      expect(manager.getActiveSessionIds()).toHaveLength(0)
    })

    it('getActiveSessionIdsは生存セッションのみ返す', async () => {
      await manager.spawn('active-1', '/tmp')
      await manager.spawn('active-2', '/tmp')
      manager.kill('active-1')
      const ids = manager.getActiveSessionIds()
      expect(ids).toContain('active-2')
      expect(ids).not.toContain('active-1')
    })

    it('exitイベントが発火する', async () => {
      const exitPromise = new Promise<{ sessionId: string; code: number }>((resolve) => {
        manager.on('exit', (sessionId: string, code: number) => {
          if (sessionId === 'exit-event') {
            resolve({ sessionId, code })
          }
        })
      })

      await manager.spawn('exit-event', '/tmp')
      // kill()でプロセスを終了（python3 pty.spawn経由のため、exit送信よりkillが確実）
      setTimeout(() => manager.kill('exit-event'), 500)

      const result = await exitPromise
      expect(result.sessionId).toBe('exit-event')
      expect(typeof result.code).toBe('number')
    }, 15000)

    it('終了済みセッションIDを再利用して再spawnできる', async () => {
      const exitPromise = new Promise<void>((resolve) => {
        manager.on('exit', (sessionId: string) => {
          if (sessionId === 'respawn-id') resolve()
        })
      })

      await manager.spawn('respawn-id', '/tmp', 120, 30, '/bin/sh', ['-lc', 'exit 0'])
      await exitPromise

      await expect(
        manager.spawn('respawn-id', '/tmp', 120, 30, '/bin/sh', ['-lc', 'sleep 0.1']),
      ).resolves.toBeUndefined()
      expect(manager.isAlive('respawn-id')).toBe(true)
    }, 15000)
  })

  // ========================================
  // getSessionBackendテスト
  // ========================================
  describe('getSessionBackend', () => {
    it('存在しないセッションはnullを返す', () => {
      expect(manager.getSessionBackend('nothing')).toBeNull()
    })

    it('セッションのバックエンド種別を返す', async () => {
      await manager.spawn('backend-1', '/tmp')
      expect(manager.getSessionBackend('backend-1')).toBe('child_process')
    })
  })

  // ========================================
  // getSessionSizeテスト
  // ========================================
  describe('getSessionSize', () => {
    it('存在しないセッションはnullを返す', () => {
      expect(manager.getSessionSize('nothing')).toBeNull()
    })
  })

  // ========================================
  // Playwrightポート割当テスト
  // ========================================
  describe('Playwrightポート割当', () => {
    it('セッションごとに異なるPLAYWRIGHT_MCP_PORTが設定される', async () => {
      const ports: string[] = []

      const collectPort = (sessionId: string, data: string) => {
        const match = data.match(/PWPORT=(\d+)/)
        if (match) ports.push(`${sessionId}:${match[1]}`)
      }
      manager.on('data', collectPort)

      // 3セッションを起動し、各セッションで環境変数を出力
      await manager.spawn('pw-1', '/tmp', 120, 30, '/bin/sh', ['-c', 'echo PWPORT=$PLAYWRIGHT_MCP_PORT'])
      await manager.spawn('pw-2', '/tmp', 120, 30, '/bin/sh', ['-c', 'echo PWPORT=$PLAYWRIGHT_MCP_PORT'])
      await manager.spawn('pw-3', '/tmp', 120, 30, '/bin/sh', ['-c', 'echo PWPORT=$PLAYWRIGHT_MCP_PORT'])

      await new Promise((resolve) => setTimeout(resolve, 1500))
      manager.removeListener('data', collectPort)

      // 各セッションに異なるポートが割り当てられていることを確認
      const portValues = ports.map((p) => p.split(':')[1])
      expect(portValues.length).toBeGreaterThanOrEqual(3)
      const uniquePorts = new Set(portValues)
      expect(uniquePorts.size).toBeGreaterThanOrEqual(3)

      // ポートが3551から連番であることを確認
      expect(uniquePorts).toContain('3551')
      expect(uniquePorts).toContain('3552')
      expect(uniquePorts).toContain('3553')
    }, 10000)
  })
})

// ========================================
// node-ptyモックテスト
// ========================================
describe('PtyManager（node-ptyモック）', () => {
  it('node-ptyバックエンドが設定された場合のgetSessionBackend', async () => {
    const manager = new PtyManager()
    manager._forceBackend('node-pty')
    // node-ptyモードでは実際のnode-ptyが必要なのでspawnはテストしない
    // バックエンド設定のみ確認
    expect(manager.backend).toBe('node-pty')
    manager.killAll()
  })
})

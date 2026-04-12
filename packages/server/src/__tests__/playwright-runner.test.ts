import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PlaywrightRunner } from '../services/playwright-runner'

describe('PlaywrightRunner', () => {
  let runner: PlaywrightRunner

  beforeEach(() => {
    runner = new PlaywrightRunner()
    // error イベントの unhandled 防止
    runner.on('runner_error', () => {})
  })

  afterEach(() => {
    runner.stopAll()
    runner.removeAllListeners()
  })

  describe('run', () => {
    it('テスト実行を開始して running 状態を返す', () => {
      // echo で即座に終了するコマンドを使ってテスト
      const result = runner.run('inst-1', 0, '/tmp', undefined)

      expect(result.instanceId).toBe('inst-1')
      expect(result.status).toBe('running')
      expect(result.port).toBe(3550)
      expect(result.startedAt).toBeGreaterThan(0)
      expect(result.testPath).toBeNull()
    })

    it('テストパスを指定して実行できる', () => {
      const result = runner.run('inst-2', 1, '/tmp', 'e2e/basic.spec.ts')

      expect(result.testPath).toBe('e2e/basic.spec.ts')
      expect(result.port).toBe(3551)
    })

    it('同じインスタンスで二重実行はエラーになる', () => {
      runner.run('inst-3', 0, '/tmp')

      expect(() => {
        runner.run('inst-3', 0, '/tmp')
      }).toThrow('既にテスト実行中')
    })

    it('異なるインスタンスは独立して実行できる', () => {
      const r1 = runner.run('inst-a', 0, '/tmp')
      const r2 = runner.run('inst-b', 1, '/tmp')

      expect(r1.port).toBe(3550)
      expect(r2.port).toBe(3551)
      expect(r1.instanceId).not.toBe(r2.instanceId)
    })
  })

  describe('run + 完了', () => {
    it('成功したテストは passed 状態になる', async () => {
      // echo で即座に exit 0 するコマンドを npxPath として使用
      const fastRunner = new PlaywrightRunner({ npxPath: 'echo' })
      fastRunner.on('runner_error', () => {})

      const result = fastRunner.run('fast-1', 0, '/tmp')

      // finished イベントを待つ
      await new Promise<void>((resolve) => {
        fastRunner.on('finished', () => resolve())
      })

      expect(result.status).toBe('passed')
      expect(result.exitCode).toBe(0)
      expect(result.finishedAt).toBeGreaterThan(0)

      fastRunner.stopAll()
    })

    it('失敗したテストは failed 状態になる', async () => {
      // false コマンドで exit 1
      const failRunner = new PlaywrightRunner({ npxPath: 'false' })
      failRunner.on('runner_error', () => {})

      const result = failRunner.run('fail-1', 0, '/tmp')

      await new Promise<void>((resolve) => {
        failRunner.on('finished', () => resolve())
      })

      expect(result.status).toBe('failed')
      expect(result.exitCode).not.toBe(0)

      failRunner.stopAll()
    })
  })

  describe('stop', () => {
    it('実行中のテストを中止できる', async () => {
      // sleep で長時間実行するコマンド
      const slowRunner = new PlaywrightRunner({ npxPath: 'sleep' })
      slowRunner.on('runner_error', () => {})

      slowRunner.run('slow-1', 0, '/tmp')
      slowRunner.stop('slow-1')

      await new Promise<void>((resolve) => {
        slowRunner.on('finished', () => resolve())
      })

      const result = slowRunner.getResult('slow-1')
      expect(result!.status).toBe('cancelled')

      slowRunner.stopAll()
    })

    it('実行していな��インスタンスの stop は安全に無視される', () => {
      expect(() => runner.stop('non-existent')).not.toThrow()
    })
  })

  describe('getResult / getStatus', () => {
    it('実行結果を取得できる', () => {
      runner.run('inst-r', 0, '/tmp')

      const result = runner.getResult('inst-r')
      expect(result).not.toBeNull()
      expect(result!.instanceId).toBe('inst-r')
    })

    it('存在しないインスタンスは null / idle を返す', () => {
      expect(runner.getResult('no-exist')).toBeNull()
      expect(runner.getStatus('no-exist')).toBe('idle')
    })
  })

  describe('getAllResults', () => {
    it('全結果を取得できる', () => {
      runner.run('a', 0, '/tmp')
      runner.run('b', 1, '/tmp')

      expect(runner.getAllResults()).toHaveLength(2)
    })
  })

  describe('clearFinished', () => {
    it('完了済みの結果をクリアする', async () => {
      const fastRunner = new PlaywrightRunner({ npxPath: 'echo' })
      fastRunner.on('runner_error', () => {})

      fastRunner.run('clear-1', 0, '/tmp')

      await new Promise<void>((resolve) => {
        fastRunner.on('finished', () => resolve())
      })

      expect(fastRunner.getAllResults()).toHaveLength(1)
      fastRunner.clearFinished()
      expect(fastRunner.getAllResults()).toHaveLength(0)

      fastRunner.stopAll()
    })
  })

  describe('イベント', () => {
    it('started イベントが発火する', () => {
      const handler = vi.fn()
      runner.on('started', handler)

      runner.run('evt-1', 0, '/tmp')

      expect(handler).toHaveBeenCalledWith('evt-1', expect.objectContaining({ instanceId: 'evt-1' }))
    })

    it('progress イベントが発火する', () => {
      const handler = vi.fn()
      runner.on('progress', handler)

      runner.run('evt-2', 0, '/tmp')

      expect(handler).toHaveBeenCalledWith('evt-2', 'running')
    })
  })

  describe('ポート分離', () => {
    it('スロット番号に応じたポートが設定される', () => {
      const r0 = runner.run('port-0', 0, '/tmp')
      const r1 = runner.run('port-1', 1, '/tmp')
      const r3 = runner.run('port-3', 3, '/tmp')

      expect(r0.port).toBe(3550)
      expect(r1.port).toBe(3551)
      expect(r3.port).toBe(3553)
    })
  })
})

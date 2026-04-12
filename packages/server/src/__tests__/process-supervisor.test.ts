import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProcessSupervisor } from '../services/process-supervisor'
import type { SpawnFn } from '../services/process-supervisor'

describe('ProcessSupervisor', () => {
  let supervisor: ProcessSupervisor

  beforeEach(() => {
    supervisor = new ProcessSupervisor({
      checkIntervalMs: 50,  // テスト用に短縮
      healthyThreshold: 2,
      maxRestarts: 1,
    })
  })

  afterEach(() => {
    supervisor.stopAll()
  })

  describe('基本操作', () => {
    it('プロセスを監視開始できる', () => {
      const spawnFn: SpawnFn = (_onExit) => process.pid // 自分自身のPIDを返す

      supervisor.supervise('inst-1', spawnFn)

      const status = supervisor.getStatus('inst-1')
      expect(status).not.toBeNull()
      expect(status!.instanceId).toBe('inst-1')
      expect(status!.pid).toBe(process.pid)
      expect(status!.status).toBe('starting')
    })

    it('同じIDで二重登録するとエラー', () => {
      supervisor.supervise('inst-1', () => process.pid)

      expect(() => supervisor.supervise('inst-1', () => process.pid)).toThrow('既に監視中')
    })

    it('stop で監視を停止できる', () => {
      supervisor.supervise('inst-1', () => process.pid)
      supervisor.stop('inst-1')

      expect(supervisor.getStatus('inst-1')).toBeNull()
    })

    it('getAllStatuses で全状態を取得できる', () => {
      supervisor.supervise('inst-1', () => process.pid)
      supervisor.supervise('inst-2', () => process.pid)

      const all = supervisor.getAllStatuses()
      expect(all).toHaveLength(2)
    })
  })

  describe('ヘルスチェック', () => {
    it('連続成功で healthy に遷移する', async () => {
      const healthyPromise = new Promise<void>((resolve) => {
        supervisor.on('healthy', (id) => {
          if (id === 'inst-1') resolve()
        })
      })

      supervisor.supervise('inst-1', () => process.pid)

      // healthyThreshold=2, checkIntervalMs=50 なので ~100ms で healthy
      await healthyPromise
      expect(supervisor.getStatus('inst-1')!.status).toBe('healthy')
    })
  })

  describe('second shot（再起動）', () => {
    it('プロセス終了時に 1 回再起動する', async () => {
      let exitCallback: ((code: number | null) => void) | null = null
      let spawnCount = 0

      const spawnFn: SpawnFn = (onExit) => {
        spawnCount++
        exitCallback = onExit
        return process.pid
      }

      const restartingPromise = new Promise<number>((resolve) => {
        supervisor.on('restarting', (_id, count) => resolve(count))
      })

      supervisor.supervise('inst-1', spawnFn)
      expect(spawnCount).toBe(1)

      // プロセス終了をシミュレート
      exitCallback!(1)

      const restartCount = await restartingPromise
      expect(restartCount).toBe(1)
      expect(spawnCount).toBe(2) // 再起動で2回目
    })

    it('再起動上限到達で error 状態に遷移する', async () => {
      let exitCallback: ((code: number | null) => void) | null = null

      const spawnFn: SpawnFn = (onExit) => {
        exitCallback = onExit
        return process.pid
      }

      const errorPromise = new Promise<void>((resolve) => {
        supervisor.on('error', () => resolve())
      })

      supervisor.supervise('inst-1', spawnFn)

      // 1回目の終了 → 再起動
      exitCallback!(1)

      // 少し待って2回目の終了 → error
      await new Promise(r => setTimeout(r, 10))
      exitCallback!(1)

      await errorPromise
      expect(supervisor.getStatus('inst-1')!.status).toBe('error')
    })
  })

  describe('spawn 失敗', () => {
    it('spawn 関数が例外を投げると error 状態になる', () => {
      const errorPromise = new Promise<void>((resolve) => {
        supervisor.on('error', () => resolve())
      })

      const spawnFn: SpawnFn = () => {
        throw new Error('起動失敗')
      }

      supervisor.supervise('inst-1', spawnFn)
      expect(supervisor.getStatus('inst-1')!.status).toBe('error')
    })
  })
})

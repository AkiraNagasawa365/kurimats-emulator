import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionStore } from '../services/session-store'
import { DevInstanceManager } from '../services/dev-instance-manager'
import type { SpawnFn } from '../services/process-supervisor'

describe('DevInstanceManager', () => {
  let store: SessionStore
  let manager: DevInstanceManager

  beforeEach(() => {
    store = new SessionStore(':memory:')
    manager = new DevInstanceManager(store, {
      checkIntervalMs: 100,
      maxRestarts: 1,
    })
  })

  afterEach(() => {
    manager.stopAll()
    store.close()
  })

  /** ダミーの spawnFn: PID を返し、プロセスが生存しているように振る舞う */
  function createDummySpawnFn(pid = 99999): SpawnFn {
    return (_onExit) => pid
  }

  describe('startInstance', () => {
    it('スロットにインスタンスを作成して監視を開始する', () => {
      const instance = manager.startInstance(0, createDummySpawnFn())

      expect(instance).toBeDefined()
      expect(instance.slotNumber).toBe(0)
      expect(instance.serverPort).toBe(14000)
      expect(instance.clientPort).toBe(5180)
      expect(instance.playwrightPort).toBe(3550)
      expect(instance.status).toBe('idle')
    })

    it('slot が既に使用中の場合はエラーになる', () => {
      manager.startInstance(0, createDummySpawnFn())

      expect(() => {
        manager.startInstance(0, createDummySpawnFn())
      }).toThrow()
    })

    it('異なるスロットは独立して起動できる', () => {
      const inst1 = manager.startInstance(0, createDummySpawnFn(100))
      const inst2 = manager.startInstance(1, createDummySpawnFn(101))

      expect(inst1.slotNumber).toBe(0)
      expect(inst2.slotNumber).toBe(1)
      expect(manager.getAllInstances()).toHaveLength(2)
    })

    it('slot 割り当て失敗時に DevInstance がロールバックされる', () => {
      // スロット0を先に手動で占有
      const preInstance = store.createDevInstance({
        slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550,
      })
      store.assignSlot(0, preInstance.id)

      // 同じスロット0で startInstance → UNIQUE 制約エラー + DevInstance ロールバック
      expect(() => {
        manager.startInstance(0, createDummySpawnFn())
      }).toThrow()

      // 元の割り当ては残っている
      expect(store.getSlotAssignment(0)!.instanceId).toBe(preInstance.id)
    })

    it('spawnFn がエラーを投げた場合はロールバックされる', () => {
      const failingSpawnFn: SpawnFn = () => {
        throw new Error('spawn 失敗')
      }

      // error イベントを受け取る（EventEmitter の unhandled error 防止）
      manager.on('error', () => { /* テスト用 */ })

      expect(() => {
        manager.startInstance(0, failingSpawnFn)
      }).toThrow('インスタンス起動失敗')

      // ロールバック: slot も DevInstance も残っていない
      expect(store.getSlotAssignment(0)).toBeNull()
      expect(store.getDevInstance(0)).toBeNull()
    })
  })

  describe('stopInstance', () => {
    it('インスタンスを停止し��リソースを解放する', () => {
      manager.startInstance(0, createDummySpawnFn())

      manager.stopInstance(0)

      expect(manager.getInstance(0)).toBeNull()
      expect(store.getSlotAssignment(0)).toBeNull()
      expect(store.getDevInstance(0)).toBeNull()
    })

    it('存在しないスロットの停止は安全に無視される', () => {
      expect(() => manager.stopInstance(999)).not.toThrow()
    })
  })

  describe('stopInstanceById', () => {
    it('インスタンス ID で停止できる', () => {
      const instance = manager.startInstance(0, createDummySpawnFn())

      manager.stopInstanceById(instance.id)

      expect(manager.getInstance(0)).toBeNull()
    })
  })

  describe('stopAll', () => {
    it('全インスタンスを停止する', () => {
      manager.startInstance(0, createDummySpawnFn(100))
      manager.startInstance(1, createDummySpawnFn(101))
      manager.startInstance(2, createDummySpawnFn(102))

      manager.stopAll()

      expect(manager.getAllInstances()).toHaveLength(0)
    })
  })

  describe('getAllInstances / getRunningInstances', () => {
    it('全インスタンスを取得できる', () => {
      manager.startInstance(0, createDummySpawnFn())
      manager.startInstance(1, createDummySpawnFn())

      expect(manager.getAllInstances()).toHaveLength(2)
    })

    it('running 状態のインスタンスのみ取得できる', () => {
      const instance = manager.startInstance(0, createDummySpawnFn())

      // 初期状態は idle なので running には含まれない
      expect(manager.getRunningInstances()).toHaveLength(0)

      // 手動で running に変更
      store.updateDevInstanceStatus(instance.id, 'running')
      expect(manager.getRunningInstances()).toHaveLength(1)
    })
  })

  describe('updateWorktreePath', () => {
    it('DevInstance の worktreePath を更新できる', () => {
      const instance = manager.startInstance(0, createDummySpawnFn())

      manager.updateWorktreePath(instance.id, '/tmp/worktree')

      const updated = manager.getInstanceById(instance.id)
      expect(updated!.worktreePath).toBe('/tmp/worktree')
    })
  })

  describe('updateSessionBinding', () => {
    it('DevInstance にセッションをバインドできる', () => {
      const instance = manager.startInstance(0, createDummySpawnFn())

      manager.updateSessionBinding(instance.id, 'session-abc')

      const updated = manager.getInstanceById(instance.id)
      expect(updated!.assignedSessionId).toBe('session-abc')
    })
  })

  describe('イベント中継', () => {
    it('supervisor の stopped イベントを中継する', () => {
      const handler = vi.fn()
      manager.on('stopped', handler)

      const instance = manager.startInstance(0, createDummySpawnFn())
      manager.stopInstance(0)

      expect(handler).toHaveBeenCalledWith(instance.id)
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../services/session-store'
import { DevInstanceManager } from '../services/dev-instance-manager'
import { SessionDevBindingService } from '../services/session-dev-binding-service'
import type { SpawnFn } from '../services/process-supervisor'

describe('SessionDevBindingService', () => {
  let store: SessionStore
  let manager: DevInstanceManager
  let service: SessionDevBindingService

  const dummySpawn: SpawnFn = (_onExit) => 99999

  beforeEach(() => {
    store = new SessionStore(':memory:')
    manager = new DevInstanceManager(store, { checkIntervalMs: 100 })
    service = new SessionDevBindingService(store, manager)
  })

  afterEach(() => {
    manager.stopAll()
    store.close()
  })

  /** テスト用セッションを作成する */
  function createSession(name = 'test-session') {
    return store.create({
      name,
      repoPath: '/tmp/repo',
    })
  }

  describe('bind', () => {
    it('セッションと DevInstance をバインドできる', () => {
      const session = createSession()
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session.id, instance.id)

      const bound = service.getBindingForSession(session.id)
      expect(bound).not.toBeNull()
      expect(bound!.id).toBe(instance.id)
      expect(bound!.assignedSessionId).toBe(session.id)
    })

    it('存在しないセッションへのバインドはエラー', () => {
      const instance = manager.startInstance(0, dummySpawn)

      expect(() => {
        service.bind('non-existent', instance.id)
      }).toThrow('セッション non-existent が見つかりません')
    })

    it('存在しないインスタンスへのバインドはエラー', () => {
      const session = createSession()

      expect(() => {
        service.bind(session.id, 'non-existent')
      }).toThrow('DevInstance non-existent が見つかりません')
    })

    it('既に別のセッションがバインドされているインスタンスへのバインドはエラー', () => {
      const session1 = createSession('session-1')
      const session2 = createSession('session-2')
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session1.id, instance.id)

      expect(() => {
        service.bind(session2.id, instance.id)
      }).toThrow('既にセッション')
    })

    it('同じセッションの再バインドは成功する（冪等）', () => {
      const session = createSession()
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session.id, instance.id)
      // 同じセッションで再度バインド → エラーにならない
      expect(() => service.bind(session.id, instance.id)).not.toThrow()
    })
  })

  describe('unbind', () => {
    it('セッションのバインドを解除できる', () => {
      const session = createSession()
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session.id, instance.id)
      service.unbind(session.id)

      expect(service.getBindingForSession(session.id)).toBeNull()

      // DevInstance 側もアンバインドされている
      const updated = manager.getInstanceById(instance.id)
      expect(updated!.assignedSessionId).toBeNull()
    })

    it('バインドされていないセッションの unbind は安全に無視される', () => {
      expect(() => service.unbind('non-existent')).not.toThrow()
    })
  })

  describe('unbindByInstance', () => {
    it('インスタンス ID でバインドを解除できる', () => {
      const session = createSession()
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session.id, instance.id)
      service.unbindByInstance(instance.id)

      expect(service.isBound(session.id)).toBe(false)
    })
  })

  describe('getBindingForSession', () => {
    it('バインドされていない場合は null を返す', () => {
      const session = createSession()
      expect(service.getBindingForSession(session.id)).toBeNull()
    })
  })

  describe('getBoundSessionId', () => {
    it('バインドされたセッション ID を取得できる', () => {
      const session = createSession()
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session.id, instance.id)

      expect(service.getBoundSessionId(instance.id)).toBe(session.id)
    })

    it('バインドされていない場合は null を返す', () => {
      const instance = manager.startInstance(0, dummySpawn)
      expect(service.getBoundSessionId(instance.id)).toBeNull()
    })
  })

  describe('isBound', () => {
    it('バインドされている場合は true を返す', () => {
      const session = createSession()
      const instance = manager.startInstance(0, dummySpawn)

      service.bind(session.id, instance.id)
      expect(service.isBound(session.id)).toBe(true)
    })

    it('バインドされていない場合は false を返す', () => {
      const session = createSession()
      expect(service.isBound(session.id)).toBe(false)
    })
  })
})

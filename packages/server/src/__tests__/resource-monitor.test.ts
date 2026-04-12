import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionStore } from '../services/session-store'
import { DevInstanceManager } from '../services/dev-instance-manager'
import { ResourceMonitorService } from '../services/resource-monitor'
import type { SpawnFn } from '../services/process-supervisor'

/** PtyManager のモック */
function createMockPtyManager() {
  return {
    getActiveSessionIds: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    removeListener: vi.fn(),
    kill: vi.fn(),
    killAll: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    spawn: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
    getBuffer: vi.fn().mockReturnValue(''),
    backend: 'node-pty' as const,
  } as any
}

describe('ResourceMonitorService', () => {
  let store: SessionStore
  let devManager: DevInstanceManager
  let monitor: ResourceMonitorService
  let mockPtyManager: ReturnType<typeof createMockPtyManager>

  const dummySpawn: SpawnFn = (_onExit) => process.pid // 自身の PID を返す（テスト用）

  beforeEach(() => {
    store = new SessionStore(':memory:')
    devManager = new DevInstanceManager(store, { checkIntervalMs: 100 })
    devManager.on('error', () => {})
    mockPtyManager = createMockPtyManager()
    monitor = new ResourceMonitorService(devManager, mockPtyManager, {
      intervalMs: 60000, // テスト中は手動収集のみ
      getWsConnectionCount: () => 3,
    })
  })

  afterEach(() => {
    monitor.stop()
    devManager.stopAll()
    store.close()
  })

  describe('collect', () => {
    it('サーバーメトリクスを収集できる', async () => {
      const snapshot = await monitor.collect()

      expect(snapshot.server).toBeDefined()
      expect(snapshot.server.pid).toBe(process.pid)
      expect(snapshot.server.memoryRss).toBeGreaterThan(0)
      expect(snapshot.server.uptime).toBeGreaterThanOrEqual(0)
      expect(snapshot.collectedAt).toBeGreaterThan(0)
    })

    it('WS 接続数を取得できる', async () => {
      const snapshot = await monitor.collect()
      expect(snapshot.wsConnectionCount).toBe(3)
    })

    it('DevInstance のメトリクスを収集できる', async () => {
      const instance = devManager.startInstance(0, dummySpawn)
      // DB に PID を設定（supervisor は非同期で設定するためテストでは手動）
      store.updateDevInstanceStatus(instance.id, 'running', process.pid)

      const snapshot = await monitor.collect()

      expect(snapshot.instances.length).toBeGreaterThanOrEqual(1)
      const instanceMetric = snapshot.instances.find(m => m.instanceId !== null)
      expect(instanceMetric).toBeDefined()
      expect(instanceMetric!.processStatus).toBe('alive')
      expect(instanceMetric!.pid).toBe(process.pid)
    })

    it('DevInstance に紐づかない active セッションも含まれる', async () => {
      mockPtyManager.getActiveSessionIds.mockReturnValue(['session-orphan'])

      const snapshot = await monitor.collect()

      const orphan = snapshot.instances.find(m => m.sessionId === 'session-orphan')
      expect(orphan).toBeDefined()
      expect(orphan!.instanceId).toBeNull()
      expect(orphan!.processStatus).toBe('unknown')
    })

    it('snapshot イベントが発火する', async () => {
      const handler = vi.fn()
      monitor.on('snapshot', handler)

      await monitor.collect()

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].server.pid).toBe(process.pid)
    })
  })

  describe('getLastSnapshot / getInstanceMetrics', () => {
    it('初期状態は null', () => {
      expect(monitor.getLastSnapshot()).toBeNull()
    })

    it('collect 後にキャッシュされる', async () => {
      await monitor.collect()
      const snapshot = monitor.getLastSnapshot()
      expect(snapshot).not.toBeNull()
      expect(snapshot!.server.pid).toBe(process.pid)
    })

    it('特定インスタンスのメトリクスを取得できる', async () => {
      const instance = devManager.startInstance(0, dummySpawn)
      await monitor.collect()

      const metrics = monitor.getInstanceMetrics(instance.id)
      expect(metrics).not.toBeNull()
      expect(metrics!.instanceId).toBe(instance.id)
    })

    it('存在しないインスタンスは null を返す', async () => {
      await monitor.collect()
      expect(monitor.getInstanceMetrics('non-existent')).toBeNull()
    })
  })

  describe('start / stop', () => {
    it('start/stop でタイマーが制御される', () => {
      // start を複数回呼んでも二重起動しない
      monitor.start()
      monitor.start()
      monitor.stop()
      // 例外なく完了
    })
  })
})

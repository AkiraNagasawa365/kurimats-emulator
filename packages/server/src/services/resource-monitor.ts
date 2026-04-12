/**
 * ResourceMonitorService — リソースメトリクスの定期収集
 *
 * 責務:
 * - PID ベースの CPU/メモリ取得（ps コマンド経由）
 * - worktree ディスク使用量取得（du コマンド経由）
 * - サーバープロセス自身のメトリクス
 * - 定期収集とイベント発火（WebSocket 通知用）
 */
import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ResourceMetrics, ResourceSnapshot, ProcessAliveness } from '@kurimats/shared'
import type { DevInstanceManager } from './dev-instance-manager.js'
import type { PtyManager } from './pty-manager.js'

const execFileAsync = promisify(execFile)

export interface ResourceMonitorOptions {
  /** 収集間隔（ms）。デフォルト 5000ms */
  intervalMs?: number
  /** WebSocket 接続数取得関数（外部注入） */
  getWsConnectionCount?: () => number
}

const DEFAULT_OPTIONS: Required<ResourceMonitorOptions> = {
  intervalMs: 5000,
  getWsConnectionCount: () => 0,
}

export class ResourceMonitorService extends EventEmitter {
  private options: Required<ResourceMonitorOptions>
  private timer: ReturnType<typeof setTimeout> | null = null
  private collecting = false
  private devInstanceManager: DevInstanceManager
  private ptyManager: PtyManager
  private lastSnapshot: ResourceSnapshot | null = null
  private startTime = Date.now()
  /** du キャッシュ（低頻度更新） */
  private diskCache = new Map<string, { bytes: number; updatedAt: number }>()
  /** du を更新する間隔（ms） */
  private diskCacheIntervalMs = 30000

  constructor(
    devInstanceManager: DevInstanceManager,
    ptyManager: PtyManager,
    options?: ResourceMonitorOptions,
  ) {
    super()
    this.devInstanceManager = devInstanceManager
    this.ptyManager = ptyManager
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 定期収集を開始する（再帰 setTimeout で前回完了を待ってから次回を予約）
   */
  start(): void {
    if (this.timer) return
    const schedule = () => {
      this.timer = setTimeout(async () => {
        try {
          await this.collect()
        } catch (err) {
          console.warn('⚠️ リソースメトリクス収集エラー:', err)
        }
        if (this.timer !== null) schedule()
      }, this.options.intervalMs)
    }

    // 初回は即座に収集してからスケジュール開始
    this.collect().catch(() => {}).then(() => schedule())
  }

  /**
   * 定期収集を停止する
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * メトリクスを即座に収集する
   */
  async collect(): Promise<ResourceSnapshot> {
    if (this.collecting) return this.lastSnapshot ?? this.emptySnapshot()
    this.collecting = true

    try {
      return await this.doCollect()
    } finally {
      this.collecting = false
    }
  }

  private emptySnapshot(): ResourceSnapshot {
    return {
      server: { pid: process.pid, cpuPercent: null, memoryRss: 0, uptime: 0 },
      instances: [],
      wsConnectionCount: 0,
      collectedAt: Date.now(),
    }
  }

  private async doCollect(): Promise<ResourceSnapshot> {
    const now = Date.now()

    // サーバープロセス自身のメトリクス
    const serverMemory = process.memoryUsage()
    const serverCpu = await this.getCpuPercent(process.pid)

    // DevInstance のメトリクス収集（並列実行）
    const instances = this.devInstanceManager.getAllInstances()
    const metrics = await Promise.all(
      instances.map(instance =>
        this.collectInstanceMetrics(instance.id, instance.pid, instance.assignedSessionId, instance.worktreePath),
      ),
    )

    // DevInstance に紐づかない active セッションのメトリクス
    const activePtyIds = this.ptyManager.getActiveSessionIds()
    const boundSessionIds = new Set(instances.map(i => i.assignedSessionId).filter(Boolean))
    for (const sessionId of activePtyIds) {
      if (!boundSessionIds.has(sessionId)) {
        metrics.push({
          instanceId: null,
          sessionId,
          pid: null,
          cpuPercent: null,
          memoryRss: null,
          processStatus: 'unknown',
          worktreeDiskUsage: null,
          collectedAt: now,
        })
      }
    }

    const snapshot: ResourceSnapshot = {
      server: {
        pid: process.pid,
        cpuPercent: serverCpu,
        memoryRss: serverMemory.rss,
        uptime: (now - this.startTime) / 1000,
      },
      instances: metrics,
      wsConnectionCount: this.options.getWsConnectionCount(),
      collectedAt: now,
    }

    this.lastSnapshot = snapshot
    this.emit('snapshot', snapshot)
    return snapshot
  }

  /**
   * 最新のスナップショットを取得する（キャッシュ）
   */
  getLastSnapshot(): ResourceSnapshot | null {
    return this.lastSnapshot
  }

  /**
   * 特定インスタンスのメトリクスを取得する
   */
  getInstanceMetrics(instanceId: string): ResourceMetrics | null {
    return this.lastSnapshot?.instances.find(m => m.instanceId === instanceId) ?? null
  }

  /** PID ベースで CPU 使用率を取得する */
  private async getCpuPercent(pid: number): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', '%cpu='], {
        timeout: 3000,
      })
      const value = parseFloat(stdout.trim())
      return isNaN(value) ? null : value
    } catch {
      return null
    }
  }

  /** PID ベースで RSS メモリを取得する（バイト） */
  private async getMemoryRss(pid: number): Promise<number | null> {
    try {
      // ps の rss はキロバイト単位
      const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'rss='], {
        timeout: 3000,
      })
      const kb = parseInt(stdout.trim(), 10)
      return isNaN(kb) ? null : kb * 1024
    } catch {
      return null
    }
  }

  /** PID の生存確認 */
  private checkAliveness(pid: number | null): ProcessAliveness {
    if (pid === null) return 'unknown'
    try {
      process.kill(pid, 0)
      return 'alive'
    } catch {
      return 'exited'
    }
  }

  /** worktree のディスク使用量を取得する（キャッシュ付き、低頻度更新） */
  private async getWorktreeDiskUsage(worktreePath: string): Promise<number | null> {
    const cached = this.diskCache.get(worktreePath)
    const now = Date.now()
    if (cached && (now - cached.updatedAt) < this.diskCacheIntervalMs) {
      return cached.bytes
    }

    try {
      // du -sk: キロバイト単位。タイムアウトは収集間隔未満に設定
      const { stdout } = await execFileAsync('du', ['-sk', worktreePath], {
        timeout: 4000,
      })
      const kb = parseInt(stdout.trim().split('\t')[0], 10)
      if (isNaN(kb)) return cached?.bytes ?? null
      const bytes = kb * 1024
      this.diskCache.set(worktreePath, { bytes, updatedAt: now })
      return bytes
    } catch {
      return cached?.bytes ?? null
    }
  }

  /** 単一インスタンスのメトリクスを収集する */
  private async collectInstanceMetrics(
    instanceId: string,
    pid: number | null,
    sessionId: string | null,
    worktreePath: string | null,
  ): Promise<ResourceMetrics> {
    const now = Date.now()

    const [cpuPercent, memoryRss, worktreeDiskUsage] = await Promise.all([
      pid ? this.getCpuPercent(pid) : Promise.resolve(null),
      pid ? this.getMemoryRss(pid) : Promise.resolve(null),
      worktreePath ? this.getWorktreeDiskUsage(worktreePath) : Promise.resolve(null),
    ])

    return {
      instanceId,
      sessionId,
      pid,
      cpuPercent,
      memoryRss,
      processStatus: this.checkAliveness(pid),
      worktreeDiskUsage,
      collectedAt: now,
    }
  }
}

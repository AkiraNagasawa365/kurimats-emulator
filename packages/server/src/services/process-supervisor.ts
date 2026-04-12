/**
 * ProcessSupervisor — プロセスの生存監視と自動再起動
 *
 * 3-snapshot ヘルスチェック:
 * - 3回連続でプロセス生存を確認 → 健全
 * - 異常検出 → second shot（1回再起動）
 * - second shot 後も異常 → error 状態に遷移
 */
import { EventEmitter } from 'events'

/** 監視対象プロセスの状態 */
export type SupervisedStatus = 'starting' | 'healthy' | 'restarting' | 'error' | 'stopped'

/** 監視対象の情報 */
export interface SupervisedProcess {
  instanceId: string
  status: SupervisedStatus
  pid: number | null
  restartCount: number
  lastCheckedAt: number | null
  consecutiveOk: number
}

/** Supervisor の設定 */
export interface SupervisorOptions {
  /** ヘルスチェック間隔（ms） */
  checkIntervalMs?: number
  /** 健全判定に必要な連続成功回数 */
  healthyThreshold?: number
  /** 最大再起動回数 */
  maxRestarts?: number
}

const DEFAULT_OPTIONS: Required<SupervisorOptions> = {
  checkIntervalMs: 5000,
  healthyThreshold: 3,
  maxRestarts: 1,
}

/**
 * spawn 関数の型: プロセスを起動して PID を返す
 * プロセス終了時に onExit コールバックを呼ぶ
 */
export type SpawnFn = (onExit: (code: number | null) => void) => number

export class ProcessSupervisor extends EventEmitter {
  private processes = new Map<string, SupervisedProcess>()
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private spawnFns = new Map<string, SpawnFn>()
  private options: Required<SupervisorOptions>

  constructor(options?: SupervisorOptions) {
    super()
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * プロセスの監視を開始する
   * @param instanceId 管理対象のインスタンスID
   * @param spawnFn プロセス起動関数
   */
  supervise(instanceId: string, spawnFn: SpawnFn): void {
    if (this.processes.has(instanceId)) {
      throw new Error(`インスタンス ${instanceId} は既に監視中です`)
    }

    this.spawnFns.set(instanceId, spawnFn)

    const proc: SupervisedProcess = {
      instanceId,
      status: 'starting',
      pid: null,
      restartCount: 0,
      lastCheckedAt: null,
      consecutiveOk: 0,
    }
    this.processes.set(instanceId, proc)

    this.startProcess(instanceId)
  }

  /**
   * 監視を停止する
   */
  stop(instanceId: string): void {
    const proc = this.processes.get(instanceId)
    if (!proc) return

    // タイマー停止
    const timer = this.timers.get(instanceId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(instanceId)
    }

    proc.status = 'stopped'
    this.processes.delete(instanceId)
    this.spawnFns.delete(instanceId)
    this.emit('stopped', instanceId)
  }

  /**
   * 全監視を停止する
   */
  stopAll(): void {
    for (const id of [...this.processes.keys()]) {
      this.stop(id)
    }
  }

  /**
   * 監視中プロセスの状態を取得する
   */
  getStatus(instanceId: string): SupervisedProcess | null {
    return this.processes.get(instanceId) ?? null
  }

  /**
   * 全監視中プロセスの状態を取得する
   */
  getAllStatuses(): SupervisedProcess[] {
    return [...this.processes.values()]
  }

  /** プロセスを起動して監視を開始する */
  private startProcess(instanceId: string): void {
    const proc = this.processes.get(instanceId)
    const spawnFn = this.spawnFns.get(instanceId)
    if (!proc || !spawnFn) return

    try {
      const pid = spawnFn((code) => {
        this.handleExit(instanceId, code)
      })
      proc.pid = pid
      proc.status = 'starting'
      proc.consecutiveOk = 0

      // ヘルスチェックタイマーを開始
      this.startHealthCheck(instanceId)
      this.emit('started', instanceId, pid)
    } catch (e) {
      proc.status = 'error'
      proc.pid = null
      this.emit('error', instanceId, e)
    }
  }

  /** プロセス終了時のハンドラ */
  private handleExit(instanceId: string, code: number | null): void {
    const proc = this.processes.get(instanceId)
    if (!proc || proc.status === 'stopped') return

    // ヘルスチェック停止
    const timer = this.timers.get(instanceId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(instanceId)
    }

    proc.pid = null
    this.emit('exit', instanceId, code)

    // second shot: 再起動可能か判定
    if (proc.restartCount < this.options.maxRestarts) {
      proc.status = 'restarting'
      proc.restartCount++
      console.warn(`⚠️ ProcessSupervisor: ${instanceId} が終了 (code=${code})。再起動します (${proc.restartCount}/${this.options.maxRestarts})`)
      this.emit('restarting', instanceId, proc.restartCount)
      this.startProcess(instanceId)
    } else {
      proc.status = 'error'
      console.error(`❌ ProcessSupervisor: ${instanceId} が再起動上限に到達。error 状態に遷移します。`)
      this.emit('error', instanceId, new Error(`再起動上限 (${this.options.maxRestarts}) に到達`))
    }
  }

  /** ヘルスチェックタイマーを開始する */
  private startHealthCheck(instanceId: string): void {
    // 既存のタイマーがあれば停止
    const existing = this.timers.get(instanceId)
    if (existing) clearInterval(existing)

    const timer = setInterval(() => {
      this.checkHealth(instanceId)
    }, this.options.checkIntervalMs)

    this.timers.set(instanceId, timer)
  }

  /** ヘルスチェック: PID が生存しているか確認 */
  private checkHealth(instanceId: string): void {
    const proc = this.processes.get(instanceId)
    if (!proc || !proc.pid) return

    proc.lastCheckedAt = Date.now()

    try {
      process.kill(proc.pid, 0) // signal 0 で生存確認
      proc.consecutiveOk++

      if (proc.consecutiveOk >= this.options.healthyThreshold && proc.status !== 'healthy') {
        proc.status = 'healthy'
        this.emit('healthy', instanceId)
      }
    } catch {
      // PID が死んでいる → handleExit が呼ばれるはずだが、念のため
      proc.consecutiveOk = 0
    }
  }
}

/**
 * DevInstanceManager — DevInstance/Slot ストアと ProcessSupervisor の統合管理
 *
 * 責務:
 * - スロット割り当て + DevInstance 作成 + プロセス監視の一括管理
 * - インスタンス停止時のリソース解放（supervisor 停止 + slot 解放 + DB 削除）
 * - 起動中インスタンスの一覧取得
 */
import { EventEmitter } from 'events'
import type { DevInstance } from '@kurimats/shared'
import type { SessionStore } from './session-store.js'
import { ProcessSupervisor, type SpawnFn } from './process-supervisor.js'
import { calculatePortsForSlot } from '../utils/ports.js'

export interface DevInstanceManagerOptions {
  /** ProcessSupervisor のヘルスチェック間隔（ms） */
  checkIntervalMs?: number
  /** 最大再起動回数 */
  maxRestarts?: number
}

export class DevInstanceManager extends EventEmitter {
  private store: SessionStore
  private supervisor: ProcessSupervisor

  constructor(store: SessionStore, options?: DevInstanceManagerOptions) {
    super()
    this.store = store
    this.supervisor = new ProcessSupervisor({
      checkIntervalMs: options?.checkIntervalMs,
      maxRestarts: options?.maxRestarts,
    })

    // supervisor イベントを中継
    this.supervisor.on('healthy', (instanceId: string) => {
      this.store.updateDevInstanceStatus(instanceId, 'running')
      this.emit('healthy', instanceId)
    })
    this.supervisor.on('error', (instanceId: string, err: unknown) => {
      this.store.updateDevInstanceStatus(instanceId, 'error')
      this.emit('error', instanceId, err)
    })
    this.supervisor.on('stopped', (instanceId: string) => {
      this.emit('stopped', instanceId)
    })
  }

  /**
   * スロットにインスタンスを作成して監視を開始する
   *
   * 1. ポート計算
   * 2. slot_assignments に排他的に割り当て
   * 3. dev_instances に DB レコード作成
   * 4. spawnFn でプロセス起動 → supervisor 監視開始
   *
   * @param slotNumber スロット番号（PANE_NUMBER に対応）
   * @param spawnFn プロセス起動関数
   * @returns 作成された DevInstance
   * @throws スロットが既に使用中の場合は UNIQUE constraint エラー
   */
  startInstance(slotNumber: number, spawnFn: SpawnFn): DevInstance {
    // ポート算出
    const ports = calculatePortsForSlot(slotNumber)

    // スロット排他割り当て（UNIQUE 制約で競合検出）
    // DevInstance を先に作成してから slot を割り当てる
    const instance = this.store.createDevInstance({
      slotNumber,
      ...ports,
    })

    try {
      this.store.assignSlot(slotNumber, instance.id)
    } catch (e) {
      // slot 割り当て失敗 → DevInstance ロールバック
      this.store.deleteDevInstance(instance.id)
      throw e
    }

    // supervisor で監視開始
    try {
      this.supervisor.supervise(instance.id, spawnFn)
    } catch (e) {
      // supervisor 開始失敗 → slot + DevInstance ロールバック
      this.store.releaseSlot(slotNumber)
      this.store.deleteDevInstance(instance.id)
      throw e
    }

    // spawnFn が即座にエラーを起こした場合（supervisor が catch → emit）
    const status = this.supervisor.getStatus(instance.id)
    if (status?.status === 'error') {
      this.supervisor.stop(instance.id)
      this.store.releaseSlot(slotNumber)
      this.store.deleteDevInstance(instance.id)
      throw new Error(`インスタンス起動失敗 (スロット${slotNumber}): spawnFn がエラーを返しました`)
    }

    return instance
  }

  /**
   * インスタンスを停止してリソースを解放する
   *
   * 1. supervisor 停止
   * 2. slot 解放
   * 3. DB レコード削除
   */
  stopInstance(slotNumber: number): void {
    const instance = this.store.getDevInstance(slotNumber)
    if (!instance) return

    // supervisor 停止（プロセス kill も含む）
    this.supervisor.stop(instance.id)

    // slot 解放
    this.store.releaseSlot(slotNumber)

    // DB レコード削除
    this.store.deleteDevInstance(instance.id)
  }

  /**
   * インスタンス ID で停止する
   */
  stopInstanceById(instanceId: string): void {
    const instance = this.store.getDevInstanceById(instanceId)
    if (!instance) return
    this.stopInstance(instance.slotNumber)
  }

  /**
   * 全インスタンスを停止する
   */
  stopAll(): void {
    const instances = this.store.getAllDevInstances()
    for (const instance of instances) {
      this.stopInstance(instance.slotNumber)
    }
  }

  /**
   * 指定スロットの DevInstance を取得する
   */
  getInstance(slotNumber: number): DevInstance | null {
    return this.store.getDevInstance(slotNumber)
  }

  /**
   * ID で DevInstance を取得する
   */
  getInstanceById(instanceId: string): DevInstance | null {
    return this.store.getDevInstanceById(instanceId)
  }

  /**
   * 全 DevInstance を取得する
   */
  getAllInstances(): DevInstance[] {
    return this.store.getAllDevInstances()
  }

  /**
   * 実行中（running）の DevInstance を取得する
   */
  getRunningInstances(): DevInstance[] {
    return this.store.getAllDevInstances().filter(i => i.status === 'running')
  }

  /**
   * supervisor の状態を取得する
   */
  getSupervisorStatus(instanceId: string) {
    return this.supervisor.getStatus(instanceId)
  }

  /**
   * DevInstance の worktreePath を更新する
   */
  updateWorktreePath(instanceId: string, worktreePath: string | null): void {
    this.store.updateDevInstanceWorktreePath(instanceId, worktreePath)
  }

  /**
   * DevInstance のセッションバインディングを更新する
   */
  updateSessionBinding(instanceId: string, sessionId: string | null): void {
    this.store.updateDevInstanceSession(instanceId, sessionId)
  }

  /**
   * シャットダウン: 全 supervisor を停止（DB レコードは残す）
   */
  shutdown(): void {
    this.supervisor.stopAll()
  }
}

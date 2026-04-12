/**
 * SessionDevBindingService — Session ↔ DevInstance のバインディング管理
 *
 * 責務:
 * - セッションと DevInstance の 1:1 紐付け
 * - バインド/アンバインドの整合性保証（双方向更新）
 * - バインディング情報の参照
 */
import type { DevInstance } from '@kurimats/shared'
import type { SessionStore } from './session-store.js'
import type { DevInstanceManager } from './dev-instance-manager.js'

export class SessionDevBindingService {
  private store: SessionStore
  private instanceManager: DevInstanceManager

  constructor(store: SessionStore, instanceManager: DevInstanceManager) {
    this.store = store
    this.instanceManager = instanceManager
  }

  /**
   * セッションと DevInstance をバインドする
   *
   * 双方向に紐付けを設定:
   * - DevInstance.assignedSessionId = sessionId
   * - （Session 側は workspaceId 等で間接参照）
   *
   * @throws セッションまたはインスタンスが存在しない場合
   */
  bind(sessionId: string, instanceId: string): void {
    const session = this.store.getById(sessionId)
    if (!session) {
      throw new Error(`セッション ${sessionId} が見つかりません`)
    }

    const instance = this.instanceManager.getInstanceById(instanceId)
    if (!instance) {
      throw new Error(`DevInstance ${instanceId} が見つかりません`)
    }

    // 既に他のセッションがバインドされている場合はエラー
    if (instance.assignedSessionId && instance.assignedSessionId !== sessionId) {
      throw new Error(
        `DevInstance ${instanceId} は既にセッション ${instance.assignedSessionId} にバインドされています`,
      )
    }

    this.instanceManager.updateSessionBinding(instanceId, sessionId)
  }

  /**
   * セッションのバインドを解除する
   *
   * セッション ID からバインドされた DevInstance を探してアンバインドする
   */
  unbind(sessionId: string): void {
    const instance = this.getBindingForSession(sessionId)
    if (instance) {
      this.instanceManager.updateSessionBinding(instance.id, null)
    }
  }

  /**
   * インスタンス ID でバインドを解除する
   */
  unbindByInstance(instanceId: string): void {
    this.instanceManager.updateSessionBinding(instanceId, null)
  }

  /**
   * セッションにバインドされた DevInstance を取得する
   */
  getBindingForSession(sessionId: string): DevInstance | null {
    const instances = this.instanceManager.getAllInstances()
    return instances.find(i => i.assignedSessionId === sessionId) ?? null
  }

  /**
   * DevInstance にバインドされたセッション ID を取得する
   */
  getBoundSessionId(instanceId: string): string | null {
    const instance = this.instanceManager.getInstanceById(instanceId)
    return instance?.assignedSessionId ?? null
  }

  /**
   * セッションが DevInstance にバインドされているかどうか
   */
  isBound(sessionId: string): boolean {
    return this.getBindingForSession(sessionId) !== null
  }
}

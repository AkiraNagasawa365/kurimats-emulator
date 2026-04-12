import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../services/session-store'
import { calculatePortsForSlot } from '../utils/ports'

describe('DevInstance / SlotAssignment', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  describe('DevInstance CRUD', () => {
    it('DevInstance を作成して取得できる', () => {
      const instance = store.createDevInstance({
        slotNumber: 0,
        serverPort: 14000,
        clientPort: 5180,
        playwrightPort: 3550,
      })

      expect(instance.id).toBeDefined()
      expect(instance.slotNumber).toBe(0)
      expect(instance.serverPort).toBe(14000)
      expect(instance.clientPort).toBe(5180)
      expect(instance.playwrightPort).toBe(3550)
      expect(instance.status).toBe('idle')
      expect(instance.pid).toBeNull()
      expect(instance.worktreePath).toBeNull()
      expect(instance.assignedSessionId).toBeNull()
    })

    it('スロット番号で DevInstance を取得できる', () => {
      store.createDevInstance({ slotNumber: 1, serverPort: 14001, clientPort: 5181, playwrightPort: 3551 })

      const retrieved = store.getDevInstance(1)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.slotNumber).toBe(1)
    })

    it('存在しないスロット番号は null を返す', () => {
      expect(store.getDevInstance(999)).toBeNull()
    })

    it('全 DevInstance を取得できる', () => {
      store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      store.createDevInstance({ slotNumber: 1, serverPort: 14001, clientPort: 5181, playwrightPort: 3551 })
      store.createDevInstance({ slotNumber: 2, serverPort: 14002, clientPort: 5182, playwrightPort: 3552 })

      const all = store.getAllDevInstances()
      expect(all).toHaveLength(3)
      expect(all[0].slotNumber).toBe(0)
      expect(all[1].slotNumber).toBe(1)
      expect(all[2].slotNumber).toBe(2)
    })

    it('状態を更新できる', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })

      store.updateDevInstanceStatus(instance.id, 'running', 12345)
      const updated = store.getDevInstanceById(instance.id)
      expect(updated!.status).toBe('running')
      expect(updated!.pid).toBe(12345)
    })

    it('worktreePath を更新できる', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })

      store.updateDevInstanceWorktreePath(instance.id, '/tmp/repo/.kurimats-worktrees/pane0')
      const updated = store.getDevInstanceById(instance.id)
      expect(updated!.worktreePath).toBe('/tmp/repo/.kurimats-worktrees/pane0')
    })

    it('セッションバインディングを更新できる', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })

      store.updateDevInstanceSession(instance.id, 'session-123')
      const updated = store.getDevInstanceById(instance.id)
      expect(updated!.assignedSessionId).toBe('session-123')

      // null でアンバインド
      store.updateDevInstanceSession(instance.id, null)
      const unbound = store.getDevInstanceById(instance.id)
      expect(unbound!.assignedSessionId).toBeNull()
    })

    it('DevInstance を削除できる（slot_assignment も連動削除）', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      store.assignSlot(0, instance.id)

      const deleted = store.deleteDevInstance(instance.id)
      expect(deleted).toBe(true)
      expect(store.getDevInstance(0)).toBeNull()
      expect(store.getSlotAssignment(0)).toBeNull()
    })

    it('同一スロット番号の二重作成は UNIQUE 制約で拒否される', () => {
      store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })

      expect(() => {
        store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      }).toThrow()
    })
  })

  describe('SlotAssignment', () => {
    it('スロットを割り当てて取得できる', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      const assignment = store.assignSlot(0, instance.id)

      expect(assignment.slotNumber).toBe(0)
      expect(assignment.instanceId).toBe(instance.id)
      expect(assignment.assignedAt).toBeGreaterThan(0)

      const retrieved = store.getSlotAssignment(0)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.instanceId).toBe(instance.id)
    })

    it('同一スロットへの二重割り当てが UNIQUE 制約で拒否される', () => {
      const inst1 = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      const inst2 = store.createDevInstance({ slotNumber: 1, serverPort: 14001, clientPort: 5181, playwrightPort: 3551 })

      store.assignSlot(0, inst1.id)

      // 同じ slotNumber=0 に別の instance を割り当てようとする → UNIQUE 制約違反
      expect(() => store.assignSlot(0, inst2.id)).toThrow()
    })

    it('異なるスロットは独立して割り当て可能', () => {
      const inst1 = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      const inst2 = store.createDevInstance({ slotNumber: 1, serverPort: 14001, clientPort: 5181, playwrightPort: 3551 })

      const a1 = store.assignSlot(0, inst1.id)
      const a2 = store.assignSlot(1, inst2.id)

      expect(a1.slotNumber).toBe(0)
      expect(a2.slotNumber).toBe(1)
    })

    it('スロットを解放できる', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      store.assignSlot(0, instance.id)

      store.releaseSlot(0)
      expect(store.getSlotAssignment(0)).toBeNull()

      // 解放後は再割り当て可能
      const newAssignment = store.assignSlot(0, instance.id)
      expect(newAssignment.slotNumber).toBe(0)
    })

    it('全スロット割り当てを取得できる', () => {
      const inst1 = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      const inst2 = store.createDevInstance({ slotNumber: 1, serverPort: 14001, clientPort: 5181, playwrightPort: 3551 })

      store.assignSlot(0, inst1.id)
      store.assignSlot(1, inst2.id)

      const all = store.getAllSlotAssignments()
      expect(all).toHaveLength(2)
      expect(all[0].slotNumber).toBe(0)
      expect(all[1].slotNumber).toBe(1)
    })

    it('同一 instanceId を複数スロットに割り当てられない（UNIQUE instance_id）', () => {
      const instance = store.createDevInstance({ slotNumber: 0, serverPort: 14000, clientPort: 5180, playwrightPort: 3550 })
      store.assignSlot(0, instance.id)

      // 同じ instance を別スロットに割り当て → UNIQUE 制約違反
      expect(() => store.assignSlot(1, instance.id)).toThrow()
    })

    it('存在しない instanceId での assignSlot は FK 制約で拒否される', () => {
      expect(() => store.assignSlot(0, 'non-existent-id')).toThrow()
    })
  })

  describe('異常系', () => {
    it('存在しない ID の deleteDevInstance は false を返す', () => {
      const result = store.deleteDevInstance('non-existent-id')
      expect(result).toBe(false)
    })
  })

  describe('calculatePortsForSlot', () => {
    it('スロット0のポートを正しく算出する', () => {
      const ports = calculatePortsForSlot(0)
      expect(ports.serverPort).toBe(14000)
      expect(ports.clientPort).toBe(5180)
      expect(ports.playwrightPort).toBe(3550)
    })

    it('スロット3のポートを正しく算出する', () => {
      const ports = calculatePortsForSlot(3)
      expect(ports.serverPort).toBe(14003)
      expect(ports.clientPort).toBe(5183)
      expect(ports.playwrightPort).toBe(3553)
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { acquireLock, releaseLock, isLocked, readLock, getLockfilePath } from '../services/leader-lock'
import type { LockInfo } from '../services/leader-lock'

/** テスト用の一時ディレクトリを作成 */
function createTempDir(): string {
  const dir = path.join(tmpdir(), `leader-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('LeaderLock', () => {
  let tempDir: string
  let lockfilePath: string

  beforeEach(() => {
    tempDir = createTempDir()
    lockfilePath = path.join(tempDir, 'test.lock')
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // テスト後のクリーンアップ失敗は無視
    }
  })

  describe('acquireLock / releaseLock 基本サイクル', () => {
    it('lockfile が存在しない場合に取得成功する', () => {
      const result = acquireLock({
        port: 14000,
        paneNumber: 0,
        type: 'dev',
        lockfilePath,
      })

      expect(result.acquired).toBe(true)
      expect(existsSync(lockfilePath)).toBe(true)

      // lockfile の内容を確認
      const info = readLock(lockfilePath)
      expect(info).not.toBeNull()
      expect(info!.pid).toBe(process.pid)
      expect(info!.port).toBe(14000)
      expect(info!.paneNumber).toBe(0)
      expect(info!.type).toBe('dev')
    })

    it('releaseLock で lockfile が削除される', () => {
      acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath })
      expect(existsSync(lockfilePath)).toBe(true)

      releaseLock({ paneNumber: 0, lockfilePath })
      expect(existsSync(lockfilePath)).toBe(false)
    })

    it('releaseLock は自分の PID でない lock を削除しない', () => {
      // 他プロセスの lock を偽装
      const fakeLock: LockInfo = {
        pid: 999999,
        port: 14000,
        paneNumber: 0,
        startedAt: new Date().toISOString(),
        type: 'dev',
      }
      writeFileSync(lockfilePath, JSON.stringify(fakeLock), 'utf-8')

      // 自分の PID と異なるので削除されない
      releaseLock({ paneNumber: 0, lockfilePath })
      expect(existsSync(lockfilePath)).toBe(true)
    })
  })

  describe('二重取得の拒否', () => {
    it('有効な lock が存在する場合に取得失敗する', () => {
      // 自プロセスの PID で lock を取得（自プロセスは当然生きている）
      const first = acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath })
      expect(first.acquired).toBe(true)

      // 同じ lockfile に対して2回目の取得 → 失敗
      const second = acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath })
      expect(second.acquired).toBe(false)
      expect(second.existingLock).toBeDefined()
      expect(second.existingLock!.pid).toBe(process.pid)
    })
  })

  describe('stale lock の自動回収', () => {
    it('存在しない PID の lockfile を上書き取得できる', () => {
      // 存在しない PID で lock を偽装
      const staleLock: LockInfo = {
        pid: 2147483647, // 存在しないPID
        port: 14000,
        paneNumber: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        type: 'dev',
      }
      writeFileSync(lockfilePath, JSON.stringify(staleLock), 'utf-8')

      // stale lock を上書きして取得成功
      const result = acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath })
      expect(result.acquired).toBe(true)

      // 新しい lock が自分の PID
      const info = readLock(lockfilePath)
      expect(info!.pid).toBe(process.pid)
    })
  })

  describe('PANE_NUMBER 別の lock 分離', () => {
    it('異なる paneNumber の lockfile は独立している', () => {
      const lockPath0 = path.join(tempDir, 'pane0.lock')
      const lockPath1 = path.join(tempDir, 'pane1.lock')

      const result0 = acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath: lockPath0 })
      const result1 = acquireLock({ port: 14001, paneNumber: 1, type: 'dev', lockfilePath: lockPath1 })

      expect(result0.acquired).toBe(true)
      expect(result1.acquired).toBe(true)
    })
  })

  describe('isLocked', () => {
    it('有効な lock が存在する場合に LockInfo を返す', () => {
      acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath })

      const info = isLocked(0, lockfilePath)
      expect(info).not.toBeNull()
      expect(info!.pid).toBe(process.pid)
    })

    it('lock が存在しない場合に null を返す', () => {
      const info = isLocked(0, lockfilePath)
      expect(info).toBeNull()
    })

    it('stale lock は null を返す', () => {
      const staleLock: LockInfo = {
        pid: 2147483647,
        port: 14000,
        paneNumber: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        type: 'dev',
      }
      writeFileSync(lockfilePath, JSON.stringify(staleLock), 'utf-8')

      const info = isLocked(0, lockfilePath)
      expect(info).toBeNull()
    })
  })

  describe('getLockfilePath', () => {
    it('paneNumber=null → server.lock', () => {
      expect(getLockfilePath(null)).toMatch(/server\.lock$/)
    })

    it('paneNumber=0 → server-dev.lock', () => {
      expect(getLockfilePath(0)).toMatch(/server-dev\.lock$/)
    })

    it('paneNumber=3 → server-pane3.lock', () => {
      expect(getLockfilePath(3)).toMatch(/server-pane3\.lock$/)
    })
  })

  describe('破損した lockfile の処理', () => {
    it('不正な JSON の lockfile は新規取得として扱われる', () => {
      writeFileSync(lockfilePath, 'not valid json', 'utf-8')

      const result = acquireLock({ port: 14000, paneNumber: 0, type: 'dev', lockfilePath })
      expect(result.acquired).toBe(true)
    })
  })
})

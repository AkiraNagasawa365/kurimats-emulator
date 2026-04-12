/**
 * LeaderLock — サーバーインスタンスの重複起動を防止する lockfile 機構
 *
 * lockfile にはPID・ポート・pane番号・起動時刻を記録し、
 * stale lock の自動回収もサポートする。
 */
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { homedir } from 'os'

/** lockfile に記録する情報 */
export interface LockInfo {
  pid: number
  port: number
  paneNumber: number | null
  startedAt: string
  type: 'electron' | 'dev'
}

/** lock 取得オプション */
export interface LockOptions {
  port: number
  paneNumber: number | null
  type: 'electron' | 'dev'
  /** lockfile パスを直接指定（テスト用） */
  lockfilePath?: string
}

/** lock 取得結果 */
export interface LockResult {
  acquired: boolean
  /** 取得失敗時: 既存 lock の情報 */
  existingLock?: LockInfo
}

/**
 * PANE_NUMBER に応じた lockfile パスを算出
 * DB ファイルと同じディレクトリ（~/.kurimats/）に配���
 */
export function getLockfilePath(paneNumber: number | null): string {
  const baseDir = path.join(homedir(), '.kurimats')
  if (paneNumber === null) return path.join(baseDir, 'server.lock')
  if (paneNumber === 0) return path.join(baseDir, 'server-dev.lock')
  return path.join(baseDir, `server-pane${paneNumber}.lock`)
}

/**
 * PID が生存し��いるかを確認する
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 既存の lockfile を読み取る
 * @returns LockInfo または null（ファイルなし・パースエラー時）
 */
export function readLock(lockfilePath: string): LockInfo | null {
  try {
    const content = readFileSync(lockfilePath, 'utf-8')
    return JSON.parse(content) as LockInfo
  } catch {
    return null
  }
}

/**
 * lock を取得する
 *
 * 1. lockfile が存在しない → 新規作成して取得成功
 * 2. lockfile が存在 + PID が生存 → 取得失敗（既に別インスタンスが稼働中）
 * 3. lockfile が存在 + PID が死亡 → stale lock として上書き取得
 */
export function acquireLock(options: LockOptions): LockResult {
  const lockfilePath = options.lockfilePath ?? getLockfilePath(options.paneNumber)
  const dir = path.dirname(lockfilePath)

  // ディレクトリがなければ作成
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // 既存 lock を確認
  const existing = readLock(lockfilePath)
  if (existing) {
    if (isPidAlive(existing.pid)) {
      // 有効な lock が存在 → 取得失敗
      return { acquired: false, existingLock: existing }
    }
    // stale lock → 上書き
    console.warn(`⚠️ LeaderLock: stale lock を検出 (PID=${existing.pid})。上書きします。`)
  }

  // lockfile を書き込み
  const lockInfo: LockInfo = {
    pid: process.pid,
    port: options.port,
    paneNumber: options.paneNumber,
    startedAt: new Date().toISOString(),
    type: options.type,
  }

  writeFileSync(lockfilePath, JSON.stringify(lockInfo, null, 2), 'utf-8')
  return { acquired: true }
}

/**
 * lock を解放する（lockfile を削除）
 */
export function releaseLock(options: { paneNumber: number | null; lockfilePath?: string }): void {
  const lockfilePath = options.lockfilePath ?? getLockfilePath(options.paneNumber)
  try {
    // 自分の PID が書かれた lock のみ削除（他プロセスの lock を誤削除しない）
    const existing = readLock(lockfilePath)
    if (existing && existing.pid === process.pid) {
      unlinkSync(lockfilePath)
    }
  } catch {
    // ファイルが既に存在しない場合は無視
  }
}

/**
 * 現在の lock 状態を取得する
 */
export function isLocked(paneNumber: number | null, lockfilePath?: string): LockInfo | null {
  const filePath = lockfilePath ?? getLockfilePath(paneNumber)
  const info = readLock(filePath)
  if (!info) return null
  // PID が死んでいれば stale → null 扱い
  if (!isPidAlive(info.pid)) return null
  return info
}

/**
 * process exit 時に lockfile を自動解放するハンドラを登録する
 */
export function registerLockCleanup(options: { paneNumber: number | null; lockfilePath?: string }): void {
  const cleanup = () => releaseLock(options)
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })
}

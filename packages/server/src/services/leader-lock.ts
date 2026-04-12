/**
 * LeaderLock — サーバーインスタンスの重複起動を防止する lockfile 機構
 *
 * lockfile にはPID・ポート・pane番号・起動時刻を記録し、
 * stale lock の自動回収もサポートする。
 *
 * 原子性: openSync('wx') で排他的作成を行い、2プロセス同時起動時の race を防止。
 * シグナル: 'exit' イベントのみで cleanup。SIGINT/SIGTERM は index.ts の shutdown() に委譲。
 */
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, openSync, closeSync, constants } from 'fs'
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
 * DB ファイルと同じディレクトリ（~/.kurimats/）に配置
 */
export function getLockfilePath(paneNumber: number | null): string {
  const baseDir = path.join(homedir(), '.kurimats')
  if (paneNumber === null) return path.join(baseDir, 'server.lock')
  if (paneNumber === 0) return path.join(baseDir, 'server-dev.lock')
  return path.join(baseDir, `server-pane${paneNumber}.lock`)
}

/**
 * PID が生存しているかを確認する
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
 * lockfile を排他的に書き込む（openSync 'wx' で原子的作成）
 * @returns true: 書き込み成功、false: ファイルが既に存在（EEXIST）
 */
function writeExclusive(lockfilePath: string, lockInfo: LockInfo): boolean {
  try {
    const fd = openSync(lockfilePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL)
    const content = JSON.stringify(lockInfo, null, 2)
    writeFileSync(fd, content, 'utf-8')
    closeSync(fd)
    return true
  } catch (e: any) {
    if (e.code === 'EEXIST') return false
    throw e
  }
}

/**
 * lock を取得する
 *
 * 原子性を確保するフロー:
 * 1. openSync('wx') で排他的作成を試みる → 成功なら取得完了
 * 2. EEXIST → 既存 lock を読み取り PID 生存チェック
 * 3. PID 生存 → 取得失敗
 * 4. PID 死亡（stale） → unlink して再度 openSync('wx') を試みる
 */
export function acquireLock(options: LockOptions): LockResult {
  const lockfilePath = options.lockfilePath ?? getLockfilePath(options.paneNumber)
  const dir = path.dirname(lockfilePath)

  // ディレクトリがなければ作成
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const lockInfo: LockInfo = {
    pid: process.pid,
    port: options.port,
    paneNumber: options.paneNumber,
    startedAt: new Date().toISOString(),
    type: options.type,
  }

  // 1回目: 排他的作成を試みる
  if (writeExclusive(lockfilePath, lockInfo)) {
    return { acquired: true }
  }

  // lockfile が既に存在 → 読み取り
  const existing = readLock(lockfilePath)
  if (existing && isPidAlive(existing.pid)) {
    // 有効な lock が存在 → 取得失敗
    return { acquired: false, existingLock: existing }
  }

  // stale lock または破損ファイル → 削除して再試行
  console.warn(`⚠️ LeaderLock: stale lock を検出 (PID=${existing?.pid ?? '不明'})。上書きします。`)
  try {
    unlinkSync(lockfilePath)
  } catch {
    // 別プロセスが先に消した場合は無視
  }

  // 2回目: 排他的作成を再試行
  if (writeExclusive(lockfilePath, lockInfo)) {
    return { acquired: true }
  }

  // 2回目も失敗 → 別プロセスが先に取得した
  const winner = readLock(lockfilePath)
  return { acquired: false, existingLock: winner ?? undefined }
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
 *
 * 注意: SIGINT/SIGTERM ハンドラは登録しない。
 * index.ts の shutdown() が ptyManager.killAll() 等のグレースフル処理を行った後に
 * process.exit(0) を呼び、それが 'exit' イベントをトリガーして lock を解放する。
 */
export function registerLockCleanup(options: { paneNumber: number | null; lockfilePath?: string }): void {
  process.on('exit', () => releaseLock(options))
}

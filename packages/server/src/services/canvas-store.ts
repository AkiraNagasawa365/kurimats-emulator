import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { homedir } from 'os'
import type { BoardLayoutState } from '@kurimats/shared'

const DEFAULT_DIR = path.join(homedir(), '.kurimats')
const CANVAS_FILE = 'canvas.json'

/**
 * キャンバス状態のJSONファイル永続化
 * SQLiteではなくJSONファイルで管理（高頻度更新に適した軽量I/O）
 */
export class CanvasStore {
  private dir: string
  private filePath: string

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR
    this.filePath = path.join(this.dir, CANVAS_FILE)
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  /**
   * キャンバス状態を保存（500msデバウンスはクライアント側で実施）
   */
  save(state: BoardLayoutState): void {
    const data = JSON.stringify(state, null, 2)
    writeFileSync(this.filePath, data, 'utf-8')
  }

  /**
   * キャンバス状態を読み込み
   */
  load(): BoardLayoutState | null {
    if (!existsSync(this.filePath)) return null
    try {
      const data = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(data) as BoardLayoutState
    } catch {
      return null
    }
  }

  /**
   * ワークスペース用のキャンバス状態を保存
   */
  saveWorkspace(workspaceId: string, state: BoardLayoutState): void {
    const wsPath = path.join(this.dir, `canvas-${workspaceId}.json`)
    writeFileSync(wsPath, JSON.stringify(state, null, 2), 'utf-8')
  }

  /**
   * ワークスペース用のキャンバス状態を読み込み
   */
  loadWorkspace(workspaceId: string): BoardLayoutState | null {
    const wsPath = path.join(this.dir, `canvas-${workspaceId}.json`)
    if (!existsSync(wsPath)) return null
    try {
      return JSON.parse(readFileSync(wsPath, 'utf-8')) as BoardLayoutState
    } catch {
      return null
    }
  }

  /** データディレクトリパスを取得 */
  getDir(): string {
    return this.dir
  }
}

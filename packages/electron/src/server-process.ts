/**
 * サーバープロセス管理モジュール
 * packages/server をバックグラウンドで起動・停止する
 */

import { ChildProcess } from 'child_process'
import * as path from 'path'

/** サーバープロセスの状態 */
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

/** プロセス生成関数の型（テスト時にモック可能） */
export type SpawnFunction = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: string; env: Record<string, string | undefined> }
) => ChildProcess

/** サーバープロセス管理クラス */
export class ServerProcessManager {
  private process: ChildProcess | null = null
  private _status: ServerStatus = 'stopped'
  private spawnFn: SpawnFunction
  private serverDir: string
  private clientDir: string | null
  private isDev: boolean

  constructor(options: { spawnFn: SpawnFunction; serverDir?: string; clientDir?: string; isDev?: boolean }) {
    this.spawnFn = options.spawnFn
    this.serverDir = options.serverDir || path.resolve(__dirname, '../../server')
    this.clientDir = options.clientDir || null
    this.isDev = options.isDev ?? true
  }

  /** 現在の状態を取得 */
  get status(): ServerStatus {
    return this._status
  }

  /** サーバーのディレクトリパスを取得 */
  get serverDirectory(): string {
    return this.serverDir
  }

  /**
   * サーバープロセスを起動する
   * 既に起動中の場合はスキップする
   */
  start(port: number = 3001): void {
    if (this.process) {
      console.log('サーバーは既に起動中です')
      return
    }

    this._status = 'starting'
    console.log(`サーバーを起動中... (ポート: ${port})`)

    try {
      const command = this.isDev ? 'npx' : 'node'
      const args = this.isDev ? ['tsx', 'watch', 'src/index.ts'] : ['index.js']

      // 本番時はクライアント静的ファイルのパスを渡す
      const env: Record<string, string | undefined> = {
        ...process.env,
        PORT: String(port),
      }
      if (!this.isDev && this.clientDir) {
        env.STATIC_DIR = this.clientDir
      }

      this.process = this.spawnFn(
        command,
        args,
        {
          cwd: this.serverDir,
          stdio: 'pipe',
          env,
        }
      )

      this.process.on('spawn', () => {
        this._status = 'running'
        console.log('サーバーが起動しました')
      })

      this.process.on('error', (err) => {
        this._status = 'error'
        console.error('サーバー起動エラー:', err.message)
        this.process = null
      })

      this.process.on('exit', (code) => {
        this._status = 'stopped'
        console.log(`サーバーが終了しました (コード: ${code})`)
        this.process = null
      })

      // 標準出力をログに流す
      this.process.stdout?.on('data', (data: Buffer) => {
        console.log(`[server] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[server] ${data.toString().trim()}`)
      })
    } catch (err) {
      this._status = 'error'
      console.error('サーバー起動に失敗:', err)
      this.process = null
    }
  }

  /**
   * サーバープロセスを停止する
   */
  stop(): void {
    if (!this.process) {
      console.log('サーバーは起動していません')
      return
    }

    console.log('サーバーを停止中...')
    this.process.kill('SIGTERM')
    this.process = null
    this._status = 'stopped'
  }

  /**
   * サーバープロセスを再起動する
   */
  restart(port: number = 3001): void {
    this.stop()
    this.start(port)
  }

  /**
   * プロセスが生存しているか確認する
   */
  isAlive(): boolean {
    return this.process !== null && !this.process.killed
  }
}

/**
 * サーバーディレクトリのパスを解決する
 * 開発時とビルド後で異なるパスに対応
 */
export function resolveServerDir(isDev: boolean, resourcesPath: string): string {
  if (isDev) {
    return path.resolve(__dirname, '../../server')
  }
  // ビルド後はextraResources内のサーバーを使用
  return path.join(resourcesPath, 'app-content', 'server')
}

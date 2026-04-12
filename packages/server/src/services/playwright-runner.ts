/**
 * PlaywrightRunner — pane 単位の Playwright テスト実行管理
 *
 * 責務:
 * - slot/instance ベースのポート固定化でテスト実行
 * - テスト進捗・結果のイベント発火（WebSocket 通知用）
 * - 多重実行の防止（instance 単位で1プロセスのみ）
 */
import { EventEmitter } from 'events'
import { spawn, type ChildProcess } from 'child_process'
import type { PlaywrightRunResult, PlaywrightRunStatus } from '@kurimats/shared'
import { calculatePort, PLAYWRIGHT_PORT_BASE } from '../utils/ports.js'

export interface PlaywrightRunnerOptions {
  /** npx コマンドパス（テスト時に差し替え可能） */
  npxPath?: string
  /** 出力バッファの最大長（バイト） */
  maxOutputLength?: number
}

const DEFAULT_OPTIONS: Required<PlaywrightRunnerOptions> = {
  npxPath: 'npx',
  maxOutputLength: 512 * 1024, // 512KB
}

export class PlaywrightRunner extends EventEmitter {
  private runs = new Map<string, PlaywrightRunResult>()
  private processes = new Map<string, ChildProcess>()
  private killTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private options: Required<PlaywrightRunnerOptions>

  constructor(options?: PlaywrightRunnerOptions) {
    super()
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * テストを実行する
   *
   * @param instanceId DevInstance ID（実行の識別子として使用）
   * @param slotNumber スロット番号（ポート算出用）
   * @param testPath テストファイルパス（省略時は全テスト）
   * @param cwd テスト実行ディレクトリ
   * @returns 実行結果オブジェクト（ステータスは running で返る）
   * @throws 既に実行中の場合
   */
  run(instanceId: string, slotNumber: number, cwd: string, testPath?: string): PlaywrightRunResult {
    const existing = this.runs.get(instanceId)
    if (existing?.status === 'running') {
      throw new Error(`インスタンス ${instanceId} は既にテスト実行中です`)
    }

    const port = calculatePort(PLAYWRIGHT_PORT_BASE, slotNumber)
    const now = Date.now()

    const result: PlaywrightRunResult = {
      instanceId,
      status: 'running',
      testPath: testPath ?? null,
      pid: null,
      startedAt: now,
      finishedAt: null,
      exitCode: null,
      output: '',
      port,
    }
    this.runs.set(instanceId, result)

    // Playwright テスト実行
    const args = ['playwright', 'test']
    if (testPath) args.push(testPath)
    args.push('--reporter=line')

    const child = spawn(this.options.npxPath, args, {
      cwd,
      env: {
        ...process.env,
        PLAYWRIGHT_MCP_PORT: String(port),
        // CI モードでヘッドレス実行
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    result.pid = child.pid ?? null
    this.processes.set(instanceId, child)

    this.emit('started', instanceId, result)
    this.emit('progress', instanceId, 'running' as PlaywrightRunStatus)

    // stdout/stderr を収集
    const appendOutput = (data: Buffer) => {
      const line = data.toString()
      const remaining = this.options.maxOutputLength - result.output.length
      if (remaining > 0) {
        result.output += remaining >= line.length ? line : line.slice(0, remaining)
      }
      this.emit('output', instanceId, line)
      this.emit('progress', instanceId, 'running' as PlaywrightRunStatus, line)
    }

    child.stdout?.on('data', appendOutput)
    child.stderr?.on('data', appendOutput)

    child.on('close', (code) => {
      result.finishedAt = Date.now()
      result.exitCode = code

      // SIGKILL フォールバックのタイマーをクリア
      const killTimer = this.killTimers.get(instanceId)
      if (killTimer) {
        clearTimeout(killTimer)
        this.killTimers.delete(instanceId)
      }

      if (result.status === 'cancelled') {
        // stop() で既にキャンセル済み
      } else if (code === 0) {
        result.status = 'passed'
      } else {
        result.status = 'failed'
      }

      this.processes.delete(instanceId)
      this.emit('finished', instanceId, result)
      this.emit('progress', instanceId, result.status)
    })

    child.on('error', (err) => {
      result.status = 'error'
      result.finishedAt = Date.now()
      result.output += `\nプロセスエラー: ${err.message}`
      this.processes.delete(instanceId)

      const killTimer = this.killTimers.get(instanceId)
      if (killTimer) {
        clearTimeout(killTimer)
        this.killTimers.delete(instanceId)
      }

      this.emit('runner_error', instanceId, err)
      this.emit('progress', instanceId, 'error' as PlaywrightRunStatus)
    })

    return result
  }

  /**
   * 実行中のテストを中止する
   */
  stop(instanceId: string): void {
    const result = this.runs.get(instanceId)
    const child = this.processes.get(instanceId)

    if (result && result.status === 'running') {
      result.status = 'cancelled'
    }

    if (child) {
      child.kill('SIGTERM')
      // 3秒後にまだ生きていれば SIGKILL（close で clearTimeout するため誤送信なし）
      const timer = setTimeout(() => {
        if (this.processes.has(instanceId)) {
          child.kill('SIGKILL')
        }
        this.killTimers.delete(instanceId)
      }, 3000)
      this.killTimers.set(instanceId, timer)
    }
  }

  /**
   * 全実行を中止する
   */
  stopAll(): void {
    for (const id of [...this.processes.keys()]) {
      this.stop(id)
    }
  }

  /**
   * 全実行を中止し、子プロセスの終了を待つ（シャットダウン用）
   * @param timeoutMs 最大待機時間（デフォルト5秒）
   */
  async stopAllAndWait(timeoutMs = 5000): Promise<void> {
    this.stopAll()
    if (this.processes.size === 0) return

    await Promise.race([
      Promise.all(
        [...this.processes.keys()].map(id =>
          new Promise<void>(resolve => {
            const check = () => {
              if (!this.processes.has(id)) return resolve()
              this.once('finished', (_finishedId) => {
                if (_finishedId === id) resolve()
                else check()
              })
            }
            check()
          }),
        ),
      ),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ])
  }

  /**
   * 実行結果を取得する
   */
  getResult(instanceId: string): PlaywrightRunResult | null {
    return this.runs.get(instanceId) ?? null
  }

  /**
   * 実行ステータスを取得する
   */
  getStatus(instanceId: string): PlaywrightRunStatus {
    return this.runs.get(instanceId)?.status ?? 'idle'
  }

  /**
   * 全実行結果を取得する
   */
  getAllResults(): PlaywrightRunResult[] {
    return [...this.runs.values()]
  }

  /**
   * 完了済みの結果をクリアする
   */
  clearFinished(): void {
    for (const [id, result] of this.runs) {
      if (result.status !== 'running') {
        this.runs.delete(id)
      }
    }
  }
}

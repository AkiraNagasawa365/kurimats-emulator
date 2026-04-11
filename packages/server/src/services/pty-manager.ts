import { spawn as cpSpawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import { fileURLToPath } from 'url'
import { RingBuffer } from './ring-buffer.js'

const __ptyDir = path.dirname(fileURLToPath(import.meta.url))
const PTY_HELPER_PATH = path.join(__ptyDir, 'pty-helper.py')

/** シェル統合スクリプトのパス */
const SHELL_INTEGRATION_ZSH = path.join(__ptyDir, 'shell-integration-zsh.sh')
const SHELL_INTEGRATION_BASH = path.join(__ptyDir, 'shell-integration-bash.sh')

/** リサイズ用の特殊エスケープシーケンス（pty-helper.pyと同期） */
const RESIZE_ESC = (cols: number, rows: number) => `\x1b[R;${cols};${rows}\x07`

// node-ptyの型定義（動的インポート用）
interface INodePty {
  spawn(
    file: string,
    args: string[] | string,
    options: {
      name?: string
      cols?: number
      rows?: number
      cwd?: string
      env?: Record<string, string | undefined>
    },
  ): IPtyProcess
}

interface IPtyProcess {
  readonly pid: number
  readonly cols: number
  readonly rows: number
  readonly process: string
  onData: (listener: (data: string) => void) => { dispose(): void }
  onExit: (listener: (e: { exitCode: number; signal?: number }) => void) => { dispose(): void }
  resize(columns: number, rows: number): void
  write(data: string | Buffer): void
  kill(signal?: string): void
}

export type PtyBackend = 'node-pty' | 'child_process'

interface PtySession {
  backend: PtyBackend
  ptyProcess?: IPtyProcess
  childProcess?: ChildProcess
  sessionId: string
  ringBuffer: RingBuffer
  alive: boolean
  cols: number
  rows: number
  cleanup: () => void
  finalized: boolean
  resizeTimer: ReturnType<typeof setTimeout> | null
}

import { PLAYWRIGHT_PORT_BASE, calculatePort } from '../utils/ports.js'
/** ペイン番号（環境変数から取得、0=develop, N=paneN, null=未設定） */
const PANE_NUMBER = process.env.PANE_NUMBER != null
  ? parseInt(process.env.PANE_NUMBER, 10)
  : null

/**
 * PTYに渡す環境変数を組み立てる
 *
 * 親プロセスの env を継承しつつ、kurimats ペインに不適切な外部ターミナル
 * （cmux 等）由来の env を除外する。kurimats.app が cmux.app のタブ内から
 * 起動された場合、親プロセスには `CMUX_WORKSPACE_ID` 等が継承されており、
 * そのまま子 shell に渡るとユーザーの `.zshrc` 側の cmux 向け cwd 継承
 * ロジックが発動し、PTY の cwd（worktree パス）を主リポに上書きしてしまう。
 * kurimats ペインは概念的に cmux ペインではないため、`CMUX_*` 系は剥がす。
 *
 * @param parentEnv 親プロセスの env（通常 `process.env`）
 * @param overrides kurimats が上書き/追加したい env（後勝ち）
 */
export function buildPtyEnv(
  parentEnv: NodeJS.ProcessEnv,
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value === undefined) continue
    // cmux など外部ターミナル由来の env は持ち込まない
    if (key.startsWith('CMUX_')) continue
    env[key] = value
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue
    env[key] = value
  }
  return env
}

// node-ptyの動的読み込み結果をキャッシュ
let nodePty: INodePty | null = null
let nodePtyChecked = false

/**
 * node-ptyの利用可否を判定して読み込む
 * @returns node-ptyモジュールまたはnull
 */
async function loadNodePty(): Promise<INodePty | null> {
  if (nodePtyChecked) return nodePty
  nodePtyChecked = true
  try {
    const mod = await import('node-pty')
    const pty = mod as unknown as INodePty
    // node-ptyのネイティブバインディングが正常に動作するか検証
    const testProc = pty.spawn('/bin/echo', ['test'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: '/tmp',
    })
    testProc.kill()
    nodePty = pty
    return nodePty
  } catch (e) {
    console.warn('node-pty利用不可。child_processモードで動作します:', e)
    return null
  }
}

/**
 * プロセス管理サービス
 * node-ptyが利用可能ならPTYモード、なければchild_processモードで動作
 */
export class PtyManager extends EventEmitter {
  private sessions = new Map<string, PtySession>()
  private _backend: PtyBackend = 'child_process'
  private _initialized = false
  private _portCounter = 0

  /**
   * 現在のバックエンド種別を取得
   */
  get backend(): PtyBackend {
    return this._backend
  }

  /**
   * バックエンド初期化（node-ptyの利用可否を判定）
   * spawn前に自動呼び出しされるが、事前呼び出しも可能
   */
  async initialize(): Promise<PtyBackend> {
    if (this._initialized) return this._backend
    this._initialized = true
    const pty = await loadNodePty()
    this._backend = pty ? 'node-pty' : 'child_process'
    return this._backend
  }

  /**
   * テスト用: バックエンドを強制設定
   */
  _forceBackend(backend: PtyBackend): void {
    this._backend = backend
    this._initialized = true
  }

  /**
   * 新しいシェルセッションを作成
   * @param command 実行コマンド（省略時はデフォルトシェル）
   * @param args コマンド引数
   */
  async spawn(
    sessionId: string,
    cwd: string,
    cols = 120,
    rows = 30,
    command?: string,
    args?: string[],
  ): Promise<void> {
    const existing = this.sessions.get(sessionId)
    if (existing?.alive) {
      throw new Error(`セッション ${sessionId} は既に存在します`)
    }
    if (existing) {
      existing.cleanup()
      this.sessions.delete(sessionId)
    }

    await this.initialize()

    // Playwright MCPポートを割当
    // PANE_NUMBER が設定されている場合はペイン番号ベース、なければ通し番号
    this._portCounter++
    const playwrightPort = PANE_NUMBER != null
      ? calculatePort(PLAYWRIGHT_PORT_BASE, PANE_NUMBER)
      : calculatePort(PLAYWRIGHT_PORT_BASE, this._portCounter)

    if (this._backend === 'node-pty' && nodePty) {
      try {
        this._spawnWithNodePty(sessionId, cwd, cols, rows, command, args, playwrightPort)
      } catch (e) {
        console.warn('node-ptyでのspawnに失敗。child_processにフォールバックします:', e)
        this._backend = 'child_process'
        this._spawnWithChildProcess(sessionId, cwd, cols, rows, command, args, playwrightPort)
      }
    } else {
      this._spawnWithChildProcess(sessionId, cwd, cols, rows, command, args, playwrightPort)
    }
  }

  /**
   * node-ptyでセッション作成
   */
  private _spawnWithNodePty(
    sessionId: string,
    cwd: string,
    cols: number,
    rows: number,
    command?: string,
    args?: string[],
    playwrightPort?: number,
  ): void {
    const cmd = command || process.env.SHELL || '/bin/zsh'
    const cmdArgs = args || []
    const shellIntegrationScript = this._getShellIntegrationPath(cmd)
    const ptyProcess = nodePty!.spawn(cmd, cmdArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildPtyEnv(process.env, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...(playwrightPort ? { PLAYWRIGHT_MCP_PORT: String(playwrightPort) } : {}),
        ...(PANE_NUMBER != null ? { PANE_NUMBER: String(PANE_NUMBER) } : {}),
        KURIMATS_SHELL_INTEGRATION: '1',
      }),
    })

    // シェル統合スクリプトをPTY起動直後にsource
    if (shellIntegrationScript) {
      ptyProcess.write(`source "${shellIntegrationScript}"\n`)
    }

    const session: PtySession = {
      backend: 'node-pty',
      ptyProcess,
      sessionId,
      ringBuffer: new RingBuffer(),
      alive: true,
      cols,
      rows,
      cleanup: () => {},
      finalized: false,
      resizeTimer: null,
    }

    const dataDisposable = ptyProcess.onData((data: string) => {
      session.ringBuffer.append(data)
      this.emit('data', sessionId, data)
    })

    const exitDisposable = ptyProcess.onExit(({ exitCode }) => {
      if (session.finalized) return
      session.finalized = true
      session.alive = false
      session.cleanup()
      this.emit('exit', sessionId, exitCode)
    })

    session.cleanup = () => {
      dataDisposable.dispose()
      exitDisposable.dispose()
    }

    this.sessions.set(sessionId, session)
  }

  /**
   * child_processでセッション作成（フォールバック）
   */
  private _spawnWithChildProcess(
    sessionId: string,
    cwd: string,
    cols: number,
    rows: number,
    command?: string,
    args?: string[],
    playwrightPort?: number,
  ): void {
    const cmd = command || process.env.SHELL || '/bin/zsh'
    const cmdArgs = args || []
    const shellIntegrationScript = this._getShellIntegrationPath(cmd)

    // python3のpty-helper.pyで擬似tty割り当て（node-pty利用不可時の代替）
    // pty-helper.pyはリサイズ用の特殊エスケープシーケンスも処理する
    const child = cpSpawn('python3', [PTY_HELPER_PATH, cmd, ...cmdArgs], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildPtyEnv(process.env, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...(playwrightPort ? { PLAYWRIGHT_MCP_PORT: String(playwrightPort) } : {}),
        ...(PANE_NUMBER != null ? { PANE_NUMBER: String(PANE_NUMBER) } : {}),
        COLUMNS: String(cols),
        LINES: String(rows),
        PTY_CWD: cwd,
        PTY_COLS: String(cols),
        PTY_ROWS: String(rows),
        KURIMATS_SHELL_INTEGRATION: '1',
      }),
    })

    // シェル統合スクリプトをPTY起動直後にsource
    if (shellIntegrationScript) {
      try {
        child.stdin?.write(`source "${shellIntegrationScript}"\n`)
      } catch {
        // プロセス起動直後のwrite失敗は無視
      }
    }

    const session: PtySession = {
      backend: 'child_process',
      childProcess: child,
      sessionId,
      ringBuffer: new RingBuffer(),
      alive: true,
      cols,
      rows,
      cleanup: () => {},
      finalized: false,
      resizeTimer: null,
    }

    const handleData = (data: Buffer) => {
      const str = data.toString()
      session.ringBuffer.append(str)
      this.emit('data', sessionId, str)
    }

    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)

    const handleExit = (code: number) => {
      if (session.finalized) return
      session.finalized = true
      session.alive = false
      session.cleanup()
      this.emit('exit', sessionId, code ?? 0)
    }

    child.on('exit', handleExit)

    child.on('error', (err) => {
      if (session.finalized) return
      console.error(`セッション ${sessionId} エラー:`, err)
      handleExit(1)
    })

    session.cleanup = () => {
      child.stdout?.off('data', handleData)
      child.stderr?.off('data', handleData)
      child.off('exit', handleExit)
    }

    this.sessions.set(sessionId, session)
  }

  /**
   * プロセスにデータを書き込み（キー入力）
   */
  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session?.alive) return

    if (session.backend === 'node-pty' && session.ptyProcess) {
      session.ptyProcess.write(data)
    } else if (session.childProcess) {
      try {
        session.childProcess.stdin?.write(data)
      } catch {
        session.alive = false
      }
    }
  }

  /**
   * ターミナルリサイズ
   * node-ptyモード: ptyProcess.resize() で完全対応
   * child_processモード: SIGWINCHシグナル送信（限定的）
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session?.alive) return

    session.cols = cols
    session.rows = rows

    if (session.backend === 'node-pty' && session.ptyProcess) {
      session.ptyProcess.resize(cols, rows)
    } else if (session.childProcess) {
      // child_processモード: デバウンス付きでpty-helper.pyにリサイズ通知
      // 連続リサイズ（ウィンドウドラッグ等）時は最後の1回だけ送信
      if (session.resizeTimer) clearTimeout(session.resizeTimer)
      session.resizeTimer = setTimeout(() => {
        session.resizeTimer = null
        try {
          session.childProcess?.stdin?.write(RESIZE_ESC(cols, rows))
        } catch (e) {
          console.warn(`セッション ${sessionId} のリサイズ送信に失敗:`, e)
        }
      }, 100)
    }
  }

  /**
   * リングバッファの内容を取得（再接続時に使用）
   */
  getBuffer(sessionId: string): string {
    return this.sessions.get(sessionId)?.ringBuffer.getSafeContent() ?? ''
  }

  /**
   * セッションが生存中か確認
   */
  isAlive(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.alive ?? false
  }

  /**
   * セッションのバックエンドを取得
   */
  getSessionBackend(sessionId: string): PtyBackend | null {
    return this.sessions.get(sessionId)?.backend ?? null
  }

  /**
   * セッションの現在のサイズを取得
   */
  getSessionSize(sessionId: string): { cols: number; rows: number } | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return { cols: session.cols, rows: session.rows }
  }

  /**
   * セッションを終了
   */
  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.resizeTimer) {
      clearTimeout(session.resizeTimer)
      session.resizeTimer = null
    }

    if (session.alive) {
      session.alive = false
      session.finalized = true
      session.cleanup()
      if (session.backend === 'node-pty' && session.ptyProcess) {
        session.ptyProcess.kill()
      } else if (session.childProcess) {
        session.childProcess.kill('SIGTERM')
      }
      this.sessions.delete(sessionId)
      this.emit('exit', sessionId, 0)
      return
    }

    session.cleanup()
    this.sessions.delete(sessionId)
  }

  /**
   * 全セッションを終了
   */
  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }

  /**
   * アクティブなセッションID一覧
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, s]) => s.alive)
      .map(([id]) => id)
  }

  /**
   * コマンド名からシェル統合スクリプトのパスを返す
   * 対応シェル以外はnullを返す
   */
  private _getShellIntegrationPath(command: string): string | null {
    const basename = path.basename(command)
    if (basename === 'zsh' || basename === 'zsh-5.9') {
      return SHELL_INTEGRATION_ZSH
    }
    if (basename === 'bash' || basename.startsWith('bash-')) {
      return SHELL_INTEGRATION_BASH
    }
    return null
  }
}

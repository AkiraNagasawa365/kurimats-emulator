import { spawn as cpSpawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

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
  ringBuffer: string
  alive: boolean
  cols: number
  rows: number
}

const RING_BUFFER_SIZE = 50 * 1024 // 50KB

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
  } catch {
    console.warn('node-pty利用不可。child_processモードで動作します')
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
    if (this.sessions.has(sessionId)) {
      throw new Error(`セッション ${sessionId} は既に存在します`)
    }

    await this.initialize()

    if (this._backend === 'node-pty' && nodePty) {
      try {
        this._spawnWithNodePty(sessionId, cwd, cols, rows, command, args)
      } catch (e) {
        console.warn('node-ptyでのspawnに失敗。child_processにフォールバックします:', e)
        this._backend = 'child_process'
        this._spawnWithChildProcess(sessionId, cwd, cols, rows, command, args)
      }
    } else {
      this._spawnWithChildProcess(sessionId, cwd, cols, rows, command, args)
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
  ): void {
    const cmd = command || process.env.SHELL || '/bin/zsh'
    const cmdArgs = args || []
    const ptyProcess = nodePty!.spawn(cmd, cmdArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    })

    const session: PtySession = {
      backend: 'node-pty',
      ptyProcess,
      sessionId,
      ringBuffer: '',
      alive: true,
      cols,
      rows,
    }

    ptyProcess.onData((data: string) => {
      session.ringBuffer += data
      if (session.ringBuffer.length > RING_BUFFER_SIZE) {
        session.ringBuffer = session.ringBuffer.slice(-RING_BUFFER_SIZE)
      }
      this.emit('data', sessionId, data)
    })

    ptyProcess.onExit(({ exitCode }) => {
      session.alive = false
      this.emit('exit', sessionId, exitCode)
    })

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
  ): void {
    const cmd = command || process.env.SHELL || '/bin/zsh'
    const cmdArgs = args || []

    // python3のpty.spawnで擬似tty割り当て（node-pty利用不可時の代替）
    // これにより、Claude Codeなどttyを要求するプログラムが正常動作する
    const ptyScript = `import pty,sys,os;os.chdir(${JSON.stringify(cwd)});pty.spawn([${JSON.stringify(cmd)}${cmdArgs.map(a => ',' + JSON.stringify(a)).join('')}])`
    const child = cpSpawn('python3', ['-c', ptyScript], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        COLUMNS: String(cols),
        LINES: String(rows),
      },
    })

    const session: PtySession = {
      backend: 'child_process',
      childProcess: child,
      sessionId,
      ringBuffer: '',
      alive: true,
      cols,
      rows,
    }

    const handleData = (data: Buffer) => {
      const str = data.toString()
      session.ringBuffer += str
      if (session.ringBuffer.length > RING_BUFFER_SIZE) {
        session.ringBuffer = session.ringBuffer.slice(-RING_BUFFER_SIZE)
      }
      this.emit('data', sessionId, str)
    }

    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)

    child.on('exit', (code) => {
      session.alive = false
      this.emit('exit', sessionId, code ?? 0)
    })

    child.on('error', (err) => {
      console.error(`セッション ${sessionId} エラー:`, err)
      session.alive = false
      this.emit('exit', sessionId, 1)
    })

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
      session.childProcess.stdin?.write(data)
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
      // child_processモードではSIGWINCHを送信（限定的サポート）
      try {
        session.childProcess.kill('SIGWINCH')
      } catch {
        // プロセス終了済みの場合は無視
      }
    }
  }

  /**
   * リングバッファの内容を取得（再接続時に使用）
   */
  getBuffer(sessionId: string): string {
    return this.sessions.get(sessionId)?.ringBuffer ?? ''
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

    if (session.alive) {
      if (session.backend === 'node-pty' && session.ptyProcess) {
        session.ptyProcess.kill()
      } else if (session.childProcess) {
        session.childProcess.kill()
      }
    }
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
}

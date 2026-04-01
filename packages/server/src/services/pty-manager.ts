import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

interface PtySession {
  process: ChildProcess
  sessionId: string
  ringBuffer: string
  alive: boolean
}

const RING_BUFFER_SIZE = 50 * 1024 // 50KB

/**
 * プロセス管理サービス
 * シェルをchild_processで起動し、WebSocketブリッジへデータを中継する
 */
export class PtyManager extends EventEmitter {
  private sessions = new Map<string, PtySession>()

  /**
   * 新しいシェルセッションを作成
   */
  spawn(sessionId: string, cwd: string, _cols = 120, _rows = 30): void {
    if (this.sessions.has(sessionId)) {
      throw new Error(`セッション ${sessionId} は既に存在します`)
    }

    const shell = process.env.SHELL || '/bin/zsh'
    const child = spawn(shell, ['-i'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        COLUMNS: String(_cols),
        LINES: String(_rows),
      },
    })

    const session: PtySession = {
      process: child,
      sessionId,
      ringBuffer: '',
      alive: true,
    }

    const handleData = (data: Buffer) => {
      const str = data.toString()
      // リングバッファに蓄積（再接続時の再送用）
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
    session.process.stdin?.write(data)
  }

  /**
   * ターミナルリサイズ（child_processでは環境変数のみ）
   */
  resize(_sessionId: string, _cols: number, _rows: number): void {
    // child_processモードではリサイズは限定的
    // 将来的にnode-pty対応時に実装
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
   * セッションを終了
   */
  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.alive) {
      session.process.kill()
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

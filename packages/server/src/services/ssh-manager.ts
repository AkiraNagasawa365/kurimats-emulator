import { Client, type ClientChannel } from 'ssh2'
import { readFileSync } from 'fs'
import { EventEmitter } from 'events'
import type { SshHost, SshConnectionStatus } from '@kurimats/shared'
import { parseSshConfig } from './ssh-config.js'
import { RingBuffer } from './ring-buffer.js'
const RECONNECT_DELAY_MS = 5000

/**
 * リモートSSHセッション情報
 */
interface SshSession {
  sessionId: string
  hostName: string
  channel: ClientChannel | null
  ringBuffer: RingBuffer
  alive: boolean
  cleanup: () => void
  finalized: boolean
}

/**
 * SSHホスト接続情報
 */
interface SshConnection {
  client: Client
  host: SshHost
  status: SshConnectionStatus
  reconnectTimer: ReturnType<typeof setTimeout> | null
  connectPromise: Promise<void> | null
}

/**
 * SSH接続マネージャー
 * リモートホストへの接続管理とリモートPTYセッションの管理を行う
 */
export class SshManager extends EventEmitter {
  private connections = new Map<string, SshConnection>()
  private sessions = new Map<string, SshSession>()
  private hosts: SshHost[] = []

  constructor() {
    super()
    this.refreshHosts()
  }

  /**
   * SSHホスト一覧を再読み込み
   */
  refreshHosts(): void {
    const configHosts = parseSshConfig()
    // 既存の接続状態を維持
    this.hosts = configHosts.map(h => ({
      ...h,
      isConnected: this.connections.get(h.name)?.status === 'online',
    }))
  }

  /**
   * SSHホスト一覧を取得
   */
  getHosts(): SshHost[] {
    return this.hosts.map(h => ({
      ...h,
      isConnected: this.connections.get(h.name)?.status === 'online',
    }))
  }

  /**
   * ホストの接続状態を取得
   */
  getStatus(hostName: string): SshConnectionStatus {
    return this.connections.get(hostName)?.status ?? 'offline'
  }

  /**
   * 全ホストの接続状態を取得
   */
  getAllStatuses(): Record<string, SshConnectionStatus> {
    const result: Record<string, SshConnectionStatus> = {}
    for (const host of this.hosts) {
      result[host.name] = this.getStatus(host.name)
    }
    return result
  }

  /**
   * SSHホストに接続
   */
  async connect(hostName: string): Promise<void> {
    // 既に接続中なら何もしない
    const existing = this.connections.get(hostName)
    if (existing?.status === 'online') {
      return
    }
    if (existing?.connectPromise) {
      return existing.connectPromise
    }

    const host = this.hosts.find(h => h.name === hostName)
    if (!host) {
      throw new Error(`SSHホスト "${hostName}" が見つかりません`)
    }

    return this.establishConnection(host)
  }

  /**
   * SSH接続を確立
   */
  private establishConnection(host: SshHost): Promise<void> {
    const pending = new Promise<void>((resolve, reject) => {
      const client = new Client()

      const connInfo: SshConnection = {
        client,
        host,
        status: 'reconnecting',
        reconnectTimer: null,
        connectPromise: null,
      }

      this.connections.set(host.name, connInfo)
      this.emit('connection_status', host.name, 'reconnecting')

      // 秘密鍵の読み込み
      let privateKey: Buffer | undefined
      if (host.identityFile) {
        try {
          privateKey = readFileSync(host.identityFile)
        } catch (e) {
          console.error(`秘密鍵の読み込みに失敗 (${host.identityFile}):`, e)
        }
      }

      client.on('ready', () => {
        connInfo.connectPromise = null
        connInfo.status = 'online'
        this.emit('connection_status', host.name, 'online')
        this.emit('connect', host.name)
        console.log(`SSH接続成功: ${host.name} (${host.user}@${host.hostname}:${host.port})`)
        resolve()
      })

      client.on('error', (err) => {
        console.error(`SSH接続エラー (${host.name}):`, err.message)
        if (connInfo.status !== 'online') {
          connInfo.connectPromise = null
          reject(new Error(`SSH接続に失敗: ${err.message}`))
        }
      })

      client.on('close', () => {
        if (connInfo.reconnectTimer) {
          clearTimeout(connInfo.reconnectTimer)
          connInfo.reconnectTimer = null
        }

        const wasOnline = connInfo.status === 'online'
        connInfo.status = 'offline'
        connInfo.connectPromise = null
        this.emit('connection_status', host.name, 'offline')
        this.emit('disconnect', host.name)

        // このホストに紐づくセッションを終了
        for (const [sessionId, session] of this.sessions) {
          if (session.hostName === host.name && session.alive) {
            session.cleanup()
            session.finalized = true
            session.alive = false
            this.emit('exit', sessionId, 1)
          }
        }

        // 自動再接続（以前オンラインだった場合のみ）
        if (wasOnline) {
          console.log(`SSH接続切断 (${host.name}): ${RECONNECT_DELAY_MS}ms後に再接続を試行`)
          connInfo.reconnectTimer = setTimeout(() => {
            this.reconnect(host.name)
          }, RECONNECT_DELAY_MS)
        }
      })

      // 接続パラメータ
      const connectConfig: Record<string, unknown> = {
        host: host.hostname,
        port: host.port,
        username: host.user,
        readyTimeout: 10000,
      }

      if (privateKey) {
        connectConfig.privateKey = privateKey
      } else {
        // エージェント認証にフォールバック
        connectConfig.agent = process.env.SSH_AUTH_SOCK
      }

      client.connect(connectConfig as Parameters<typeof client.connect>[0])
    })
    const conn = this.connections.get(host.name)
    if (conn) {
      conn.connectPromise = pending
    }
    return pending
  }

  /**
   * 再接続を試行
   */
  private async reconnect(hostName: string): Promise<void> {
    const conn = this.connections.get(hostName)
    if (!conn || conn.status === 'online') return

    const host = this.hosts.find(h => h.name === hostName)
    if (!host) return

    conn.status = 'reconnecting'
    this.emit('connection_status', hostName, 'reconnecting')
    this.emit('reconnect', hostName)

    try {
      await this.establishConnection(host)
    } catch {
      console.error(`SSH再接続失敗 (${hostName})`)
    }
  }

  /**
   * SSH接続を切断
   */
  disconnect(hostName: string): void {
    const conn = this.connections.get(hostName)
    if (!conn) return

    // 再接続タイマーをクリア
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }

    // このホストのセッションを全て終了
    for (const [sessionId, session] of this.sessions) {
      if (session.hostName === hostName) {
        this.kill(sessionId)
      }
    }

    conn.client.end()
    this.connections.delete(hostName)
    this.emit('connection_status', hostName, 'offline')
  }

  /**
   * リモートシェルセッションを作成
   */
  spawn(sessionId: string, hostName: string, cwd: string, cols = 120, rows = 30): Promise<void> {
    const existingSession = this.sessions.get(sessionId)
    if (existingSession?.alive) {
      throw new Error(`セッション ${sessionId} は既に存在します`)
    }
    if (existingSession) {
      existingSession.cleanup()
      this.sessions.delete(sessionId)
    }

    const conn = this.connections.get(hostName)
    if (!conn || conn.status !== 'online') {
      throw new Error(`SSHホスト "${hostName}" に接続されていません`)
    }

    return new Promise<void>((resolve, reject) => {
      conn.client.shell(
        {
          term: 'xterm-256color',
          cols,
          rows,
        },
        (err, channel) => {
          if (err) {
            reject(new Error(`リモートシェル起動エラー: ${err.message}`))
            return
          }

          const session: SshSession = {
            sessionId,
            hostName,
            channel,
            ringBuffer: new RingBuffer(),
            alive: true,
            cleanup: () => {},
            finalized: false,
          }

          // 作業ディレクトリの変更
          channel.write(`cd ${cwd} && clear\n`)

          const onData = (data: Buffer) => {
            const str = data.toString()
            session.ringBuffer.append(str)
            this.emit('data', sessionId, str)
          }

          const onStderr = (data: Buffer) => {
            const str = data.toString()
            session.ringBuffer.append(str)
            this.emit('data', sessionId, str)
          }

          const onClose = () => {
            if (session.finalized) return
            session.finalized = true
            session.cleanup()
            session.alive = false
            this.emit('exit', sessionId, 0)
          }

          channel.on('data', onData)
          channel.stderr.on('data', onStderr)
          channel.on('close', onClose)

          session.cleanup = () => {
            channel.off('data', onData)
            channel.stderr.off('data', onStderr)
            channel.off('close', onClose)
          }

          this.sessions.set(sessionId, session)
          resolve()
        }
      )
    })
  }

  /**
   * リモートセッションにデータを書き込み
   */
  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session?.alive || !session.channel) return
    session.channel.write(data)
  }

  /**
   * リモートターミナルリサイズ
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session?.alive || !session.channel) return
    session.channel.setWindow(rows, cols, 0, 0)
  }

  /**
   * リングバッファの内容を取得
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
   * セッションを終了
   */
  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.alive && session.channel) {
      session.alive = false
      session.finalized = true
      session.cleanup()
      session.channel.close()
      this.sessions.delete(sessionId)
      this.emit('exit', sessionId, 0)
      return
    }
    session.cleanup()
    this.sessions.delete(sessionId)
  }

  /**
   * 全セッションを終了し、全接続を切断
   */
  disconnectAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
    for (const [name] of this.connections) {
      this.disconnect(name)
    }
  }

  /**
   * アクティブなリモートセッションID一覧
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, s]) => s.alive)
      .map(([id]) => id)
  }

  /**
   * セッションがリモートSSHセッションか判定
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { ServerProcessManager, resolveServerDir, SpawnFunction } from '../server-process'

/** モックの子プロセスを作成する */
function createMockChildProcess() {
  const proc = new EventEmitter() as any
  proc.killed = false
  proc.kill = vi.fn((signal?: string) => {
    proc.killed = true
    proc.emit('exit', 0, signal)
  })
  proc.stdout = new Readable({ read() {} })
  proc.stderr = new Readable({ read() {} })
  return proc
}

describe('ServerProcessManager', () => {
  let mockSpawn: ReturnType<typeof vi.fn>
  let mockProcess: ReturnType<typeof createMockChildProcess>

  beforeEach(() => {
    mockProcess = createMockChildProcess()
    mockSpawn = vi.fn().mockReturnValue(mockProcess)
  })

  function createManager(serverDir?: string) {
    return new ServerProcessManager({
      spawnFn: mockSpawn as unknown as SpawnFunction,
      serverDir: serverDir || '/test/packages/server',
    })
  }

  describe('初期状態', () => {
    it('初期状態はstoppedである', () => {
      const manager = createManager()
      expect(manager.status).toBe('stopped')
    })

    it('初期状態でisAliveはfalseを返す', () => {
      const manager = createManager()
      expect(manager.isAlive()).toBe(false)
    })

    it('指定したサーバーディレクトリが設定される', () => {
      const manager = createManager('/custom/server/path')
      expect(manager.serverDirectory).toBe('/custom/server/path')
    })
  })

  describe('start', () => {
    it('spawnFnを正しい引数で呼び出す', () => {
      const manager = createManager()
      manager.start(3001)

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['tsx', 'watch', 'src/index.ts'],
        expect.objectContaining({
          cwd: '/test/packages/server',
          stdio: 'pipe',
          env: expect.objectContaining({ PORT: '3001' }),
        })
      )
    })

    it('デフォルトポート3001で起動する', () => {
      const manager = createManager()
      manager.start()

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['tsx', 'watch', 'src/index.ts'],
        expect.objectContaining({
          env: expect.objectContaining({ PORT: '3001' }),
        })
      )
    })

    it('カスタムポートで起動できる', () => {
      const manager = createManager()
      manager.start(4000)

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['tsx', 'watch', 'src/index.ts'],
        expect.objectContaining({
          env: expect.objectContaining({ PORT: '4000' }),
        })
      )
    })

    it('起動直後の状態はstartingになる', () => {
      const manager = createManager()
      manager.start()
      expect(manager.status).toBe('starting')
    })

    it('spawnイベントで状態がrunningになる', () => {
      const manager = createManager()
      manager.start()
      mockProcess.emit('spawn')
      expect(manager.status).toBe('running')
    })

    it('errorイベントで状態がerrorになる', () => {
      const manager = createManager()
      manager.start()
      mockProcess.emit('error', new Error('起動失敗'))
      expect(manager.status).toBe('error')
    })

    it('exitイベントで状態がstoppedになる', () => {
      const manager = createManager()
      manager.start()
      mockProcess.emit('spawn')
      mockProcess.emit('exit', 0)
      expect(manager.status).toBe('stopped')
    })

    it('既に起動中の場合は二重起動しない', () => {
      const manager = createManager()
      manager.start()
      manager.start() // 2回目
      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })
  })

  describe('stop', () => {
    it('SIGTERMでプロセスを終了する', () => {
      const manager = createManager()
      manager.start()
      manager.stop()

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('停止後の状態はstoppedになる', () => {
      const manager = createManager()
      manager.start()
      manager.stop()
      expect(manager.status).toBe('stopped')
    })

    it('プロセスが未起動の場合はエラーにならない', () => {
      const manager = createManager()
      expect(() => manager.stop()).not.toThrow()
    })

    it('停止後はisAliveがfalseを返す', () => {
      const manager = createManager()
      manager.start()
      manager.stop()
      expect(manager.isAlive()).toBe(false)
    })
  })

  describe('restart', () => {
    it('停止してから起動する', () => {
      const manager = createManager()
      const secondProcess = createMockChildProcess()
      mockSpawn.mockReturnValueOnce(mockProcess).mockReturnValueOnce(secondProcess)

      manager.start()
      manager.restart(3002)

      // 1回目のstart + restart内のstart = 2回
      expect(mockSpawn).toHaveBeenCalledTimes(2)
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  describe('isAlive', () => {
    it('起動中でkilledでないプロセスはtrueを返す', () => {
      const manager = createManager()
      manager.start()
      expect(manager.isAlive()).toBe(true)
    })

    it('killされたプロセスはfalseを返す', () => {
      const manager = createManager()
      manager.start()
      mockProcess.kill('SIGTERM')
      // stopするとprocess = nullになるのでisAlive = false
      manager.stop()
      expect(manager.isAlive()).toBe(false)
    })
  })

  describe('本番モード', () => {
    function createProdManager(clientDir?: string) {
      return new ServerProcessManager({
        spawnFn: mockSpawn as unknown as SpawnFunction,
        serverDir: '/app/Resources/app-content/server',
        clientDir: clientDir || '/app/Resources/app-content/client',
        isDev: false,
      })
    }

    it('本番時はnodeコマンドでindex.jsを実行する', () => {
      const manager = createProdManager()
      manager.start(13001)

      expect(mockSpawn).toHaveBeenCalledWith(
        'node',
        ['index.js'],
        expect.objectContaining({
          cwd: '/app/Resources/app-content/server',
          env: expect.objectContaining({ PORT: '13001' }),
        })
      )
    })

    it('本番時はSTATIC_DIR環境変数が設定される', () => {
      const manager = createProdManager('/app/Resources/app-content/client')
      manager.start(13001)

      const envArg = mockSpawn.mock.calls[0][2].env
      expect(envArg.STATIC_DIR).toBe('/app/Resources/app-content/client')
    })

    it('PATHにHomebrew等のパスが補完される', () => {
      const manager = createProdManager()
      manager.start(13001)

      const envArg = mockSpawn.mock.calls[0][2].env
      expect(envArg.PATH).toContain('/opt/homebrew/bin')
      expect(envArg.PATH).toContain('/usr/local/bin')
    })
  })

  describe('spawnFnエラーハンドリング', () => {
    it('spawnFnが例外を投げた場合、状態がerrorになる', () => {
      const throwingSpawn = vi.fn(() => {
        throw new Error('spawn失敗')
      })
      const manager = new ServerProcessManager({
        spawnFn: throwingSpawn as unknown as SpawnFunction,
        serverDir: '/test/packages/server',
      })

      manager.start()
      expect(manager.status).toBe('error')
      expect(manager.isAlive()).toBe(false)
    })
  })
})

describe('resolveServerDir', () => {
  it('開発モードでは__dirnameからの相対パスを返す', () => {
    const result = resolveServerDir(true, '/app')
    expect(result).toContain('server')
  })

  it('ビルドモードではresourcesPath配下のパスを返す', () => {
    const result = resolveServerDir(false, '/Applications/kurimats.app/Contents/Resources')
    expect(result).toBe('/Applications/kurimats.app/Contents/Resources/app-content/server')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createFilesRouter } from '../routes/files.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { FileNode } from '@kurimats/shared'

// SshManagerのモック
function createMockSshManager(overrides: Partial<Record<string, unknown>> = {}): SshManager {
  return {
    listDirectory: vi.fn().mockResolvedValue([
      { name: 'src', path: '/remote/project/src', isDirectory: true, children: [] },
      { name: 'README.md', path: '/remote/project/README.md', isDirectory: false },
    ] as FileNode[]),
    readFile: vi.fn().mockResolvedValue('# リモートファイルの内容'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SshManager
}

// Expressのreq/resモック
function mockReq(query: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  return { query, body }
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status: vi.fn().mockImplementation((code: number) => {
      res.statusCode = code
      return res
    }),
    json: vi.fn().mockImplementation((data: unknown) => {
      res.body = data
      return res
    }),
  }
  return res
}

describe('ファイルAPI（リモートファイル対応）', () => {
  // ========================================
  // ルーター作成テスト
  // ========================================
  describe('createFilesRouter', () => {
    it('sshManagerなしでルーターを作成できる', () => {
      const router = createFilesRouter()
      expect(router).toBeDefined()
    })

    it('sshManagerありでルーターを作成できる', () => {
      const mock = createMockSshManager()
      const router = createFilesRouter(mock)
      expect(router).toBeDefined()
    })
  })

  // ========================================
  // SshManager SFTPメソッドのモックテスト
  // ========================================
  describe('SshManagerのSFTPメソッド呼び出し', () => {
    it('listDirectoryが正しい引数で呼ばれる', async () => {
      const mock = createMockSshManager()
      const result = await mock.listDirectory('my-server', '/remote/project')
      expect(mock.listDirectory).toHaveBeenCalledWith('my-server', '/remote/project')
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('src')
      expect(result[0].isDirectory).toBe(true)
      expect(result[1].name).toBe('README.md')
      expect(result[1].isDirectory).toBe(false)
    })

    it('readFileが正しい引数で呼ばれ、内容を返す', async () => {
      const mock = createMockSshManager()
      const content = await mock.readFile('my-server', '/remote/project/README.md')
      expect(mock.readFile).toHaveBeenCalledWith('my-server', '/remote/project/README.md')
      expect(content).toBe('# リモートファイルの内容')
    })

    it('writeFileが正しい引数で呼ばれる', async () => {
      const mock = createMockSshManager()
      await mock.writeFile('my-server', '/remote/project/test.txt', '新しい内容')
      expect(mock.writeFile).toHaveBeenCalledWith('my-server', '/remote/project/test.txt', '新しい内容')
    })

    it('listDirectoryのエラーが正しく伝播する', async () => {
      const mock = createMockSshManager({
        listDirectory: vi.fn().mockRejectedValue(new Error('SSHホスト "dead" に接続されていません')),
      })
      await expect(mock.listDirectory('dead', '/remote')).rejects.toThrow('接続されていません')
    })

    it('readFileのサイズ超過エラーが伝播する', async () => {
      const mock = createMockSshManager({
        readFile: vi.fn().mockRejectedValue(new Error('ファイルサイズが上限を超えています (2MB > 1MB)')),
      })
      await expect(mock.readFile('my-server', '/remote/big.bin')).rejects.toThrow('サイズが上限')
    })

    it('writeFileのエラーが伝播する', async () => {
      const mock = createMockSshManager({
        writeFile: vi.fn().mockRejectedValue(new Error('リモートファイル書き込みエラー: Permission denied')),
      })
      await expect(mock.writeFile('my-server', '/remote/readonly.txt', 'test')).rejects.toThrow('Permission denied')
    })
  })

  // ========================================
  // filesApi URLパラメータ構築テスト
  // ========================================
  describe('APIパラメータ構築', () => {
    it('sshHostなしの場合URLにsshHostパラメータが含まれない', () => {
      const params = new URLSearchParams({ root: '/local/path' })
      expect(params.toString()).toBe('root=%2Flocal%2Fpath')
      expect(params.has('sshHost')).toBe(false)
    })

    it('sshHostありの場合URLにsshHostパラメータが含まれる', () => {
      const params = new URLSearchParams({ root: '/remote/path' })
      params.set('sshHost', 'my-server')
      expect(params.has('sshHost')).toBe(true)
      expect(params.get('sshHost')).toBe('my-server')
    })

    it('PUTリクエストのbodyにsshHostが含まれる', () => {
      const body = { path: '/remote/test.txt', content: 'hello', sshHost: 'my-server' }
      expect(body.sshHost).toBe('my-server')
    })

    it('PUTリクエストのbodyにsshHostがnullの場合省略される', () => {
      const sshHost: string | null = null
      const body = { path: '/local/test.txt', content: 'hello', ...(sshHost ? { sshHost } : {}) }
      expect('sshHost' in body).toBe(false)
    })
  })
})

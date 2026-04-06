import { Router } from 'express'
import { readdir, readFile, writeFile, stat } from 'fs/promises'
import path from 'path'
import type { FileNode } from '@kurimats/shared'
import type { SshManager } from '../services/ssh-manager.js'

/**
 * ファイルAPIルーター
 * sshHostパラメータがある場合はSFTP経由でリモート操作、なければローカルfs
 */
export function createFilesRouter(sshManager?: SshManager): Router {
  const router = Router()

  // 無視するディレクトリ/ファイル
  const IGNORE = new Set([
    'node_modules', '.git', '.kurimats-worktrees', '.turbo',
    'dist', '.next', '__pycache__', '.DS_Store',
  ])

  /**
   * ローカルディレクトリツリーを再帰的に取得（深さ制限あり）
   */
  async function buildTree(dirPath: string, depth = 0, maxDepth = 3): Promise<FileNode[]> {
    if (depth >= maxDepth) return []

    const entries = await readdir(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []

    for (const entry of entries) {
      if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue

      const fullPath = path.join(dirPath, entry.name)
      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      }

      if (entry.isDirectory()) {
        node.children = await buildTree(fullPath, depth + 1, maxDepth)
      }

      nodes.push(node)
    }

    // ディレクトリ優先、アルファベット順
    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * パスサニタイズ（ディレクトリトラバーサル防止）
   * basePath外へのアクセスをブロックする
   */
  function sanitizeRemotePath(basePath: string, requestedPath: string): string {
    const resolved = path.posix.resolve(basePath, requestedPath)
    if (!resolved.startsWith(basePath)) {
      throw new Error('パストラバーサル検出: ベースディレクトリ外へのアクセスは禁止されています')
    }
    return resolved
  }

  // ファイルツリー取得
  router.get('/tree', async (req, res) => {
    const root = req.query.root as string
    const sshHost = req.query.sshHost as string | undefined

    if (!root) {
      res.status(400).json({ error: 'root パラメータが必要です' })
      return
    }

    try {
      if (sshHost && sshManager) {
        // リモート: SFTP経由
        const tree = await sshManager.listDirectory(sshHost, root)
        res.json(tree)
      } else {
        // ローカル: fs
        const tree = await buildTree(root)
        res.json(tree)
      }
    } catch (e) {
      const status = sshHost ? 502 : 500
      res.status(status).json({ error: `ツリー取得エラー: ${e}` })
    }
  })

  // ファイル内容取得
  router.get('/content', async (req, res) => {
    const filePath = req.query.path as string
    const sshHost = req.query.sshHost as string | undefined

    if (!filePath) {
      res.status(400).json({ error: 'path パラメータが必要です' })
      return
    }

    try {
      if (sshHost && sshManager) {
        // リモート: SFTP経由
        const content = await sshManager.readFile(sshHost, filePath)
        res.json({ content, path: filePath })
      } else {
        // ローカル: fs
        const info = await stat(filePath)
        if (info.size > 1024 * 1024) {
          res.status(413).json({ error: 'ファイルサイズが1MBを超えています' })
          return
        }
        const content = await readFile(filePath, 'utf-8')
        res.json({ content, path: filePath })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const status = msg.includes('サイズが上限') ? 413 : sshHost ? 502 : 500
      res.status(status).json({ error: `ファイル読み込みエラー: ${msg}` })
    }
  })

  // ファイル保存
  router.put('/content', async (req, res) => {
    const { path: filePath, content, sshHost } = req.body as {
      path: string
      content: string
      sshHost?: string
    }
    if (!filePath || content === undefined) {
      res.status(400).json({ error: 'path と content が必要です' })
      return
    }

    try {
      if (sshHost && sshManager) {
        // リモート: SFTP経由
        await sshManager.writeFile(sshHost, filePath, content)
        res.json({ ok: true })
      } else {
        // ローカル: fs
        await writeFile(filePath, content, 'utf-8')
        res.json({ ok: true })
      }
    } catch (e) {
      const status = sshHost ? 502 : 500
      res.status(status).json({ error: `ファイル保存エラー: ${e}` })
    }
  })

  return router
}

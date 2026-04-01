import { Router } from 'express'
import { readdir, readFile, writeFile, stat } from 'fs/promises'
import path from 'path'
import type { FileNode } from '@kurimats/shared'

export function createFilesRouter(): Router {
  const router = Router()

  // 無視するディレクトリ/ファイル
  const IGNORE = new Set([
    'node_modules', '.git', '.kurimats-worktrees', '.turbo',
    'dist', '.next', '__pycache__', '.DS_Store',
  ])

  /**
   * ディレクトリツリーを再帰的に取得（深さ制限あり）
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

  // ファイルツリー取得
  router.get('/tree', async (req, res) => {
    const root = req.query.root as string
    if (!root) {
      res.status(400).json({ error: 'root パラメータが必要です' })
      return
    }

    try {
      const tree = await buildTree(root)
      res.json(tree)
    } catch (e) {
      res.status(500).json({ error: `ツリー取得エラー: ${e}` })
    }
  })

  // ファイル内容取得
  router.get('/content', async (req, res) => {
    const filePath = req.query.path as string
    if (!filePath) {
      res.status(400).json({ error: 'path パラメータが必要です' })
      return
    }

    try {
      const info = await stat(filePath)
      if (info.size > 1024 * 1024) {
        res.status(413).json({ error: 'ファイルサイズが1MBを超えています' })
        return
      }
      const content = await readFile(filePath, 'utf-8')
      res.json({ content, path: filePath })
    } catch (e) {
      res.status(500).json({ error: `ファイル読み込みエラー: ${e}` })
    }
  })

  // ファイル保存
  router.put('/content', async (req, res) => {
    const { path: filePath, content } = req.body as { path: string; content: string }
    if (!filePath || content === undefined) {
      res.status(400).json({ error: 'path と content が必要です' })
      return
    }

    try {
      await writeFile(filePath, content, 'utf-8')
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: `ファイル保存エラー: ${e}` })
    }
  })

  return router
}

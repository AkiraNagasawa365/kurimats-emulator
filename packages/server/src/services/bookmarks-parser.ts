import { readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import type { TabBookmark } from '@kurimats/shared'

const BOOKMARKS_PATH = resolve(homedir(), '.config/tab/bookmarks.toml')

/**
 * bookmarks.toml をパースして TabBookmark[] を返す
 *
 * フォーマット:
 *   ["bookmark-name"]
 *   directory = "/path/to/dir"
 *   host = "remote-host"     # リモートの場合のみ
 *   shared = true            # オプション
 */
export function parseBookmarksToml(filePath = BOOKMARKS_PATH): TabBookmark[] {
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    console.warn(`bookmarks.toml が見つかりません: ${filePath}`)
    return []
  }

  const bookmarks: TabBookmark[] = []
  let current: Partial<TabBookmark> | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // セクションヘッダ: ["name"] or [name]
    const sectionMatch = trimmed.match(/^\[["']?(.+?)["']?\]$/)
    if (sectionMatch) {
      // 前のエントリを保存
      if (current?.name && current?.directory) {
        bookmarks.push(current as TabBookmark)
      }
      current = { name: sectionMatch[1] }
      continue
    }

    if (!current) continue

    // キー = 値 のパース
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]
    let value = kvMatch[2].trim()

    // 文字列値のクォート除去
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    switch (key) {
      case 'directory':
        current.directory = value
        break
      case 'host':
        current.host = value
        break
      case 'shared':
        current.shared = value === 'true'
        break
    }
  }

  // 最後のエントリを保存
  if (current?.name && current?.directory) {
    bookmarks.push(current as TabBookmark)
  }

  return bookmarks
}

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { SshHost } from '@kurimats/shared'

/**
 * SSHホスト設定のパース結果（内部用）
 */
interface ParsedHost {
  name: string
  hostname: string
  user: string
  port: number
  identityFile: string | null
}

/**
 * ~/.ssh/config をパースしてSSHホスト一覧を返す
 */
export function parseSshConfig(): SshHost[] {
  const configPath = join(homedir(), '.ssh', 'config')

  if (!existsSync(configPath)) {
    console.log('SSH設定ファイルが見つかりません:', configPath)
    return []
  }

  let content: string
  try {
    content = readFileSync(configPath, 'utf-8')
  } catch (e) {
    console.error('SSH設定ファイルの読み込みに失敗:', e)
    return []
  }

  const hosts = parseConfigContent(content)

  return hosts.map(h => ({
    ...h,
    isConnected: false,
  }))
}

/**
 * SSH config内容をパースする
 */
function parseConfigContent(content: string): ParsedHost[] {
  const hosts: ParsedHost[] = []
  let current: Partial<ParsedHost> | null = null

  const lines = content.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // コメント・空行をスキップ
    if (!line || line.startsWith('#')) continue

    // Key Value のペアを取得
    const match = line.match(/^(\S+)\s+(.+)$/)
    if (!match) continue

    const [, key, value] = match
    const keyLower = key.toLowerCase()

    if (keyLower === 'host') {
      // ワイルドカードホスト（* を含む）はスキップ
      if (value.includes('*')) {
        current = null
        continue
      }
      // 前のホストを保存
      if (current?.name) {
        hosts.push(finalizeHost(current))
      }
      current = { name: value.trim() }
    } else if (current) {
      switch (keyLower) {
        case 'hostname':
          current.hostname = value.trim()
          break
        case 'user':
          current.user = value.trim()
          break
        case 'port':
          current.port = parseInt(value.trim(), 10)
          break
        case 'identityfile':
          current.identityFile = resolveIdentityFile(value.trim())
          break
      }
    }
  }

  // 最後のホストを保存
  if (current?.name) {
    hosts.push(finalizeHost(current))
  }

  return hosts
}

/**
 * パース中のホストをデフォルト値で補完
 */
function finalizeHost(partial: Partial<ParsedHost>): ParsedHost {
  return {
    name: partial.name!,
    hostname: partial.hostname || partial.name!,
    user: partial.user || 'root',
    port: partial.port || 22,
    identityFile: partial.identityFile || null,
  }
}

/**
 * IdentityFileのパスを解決（~を展開）
 */
function resolveIdentityFile(filePath: string): string {
  if (filePath.startsWith('~')) {
    return join(homedir(), filePath.slice(1))
  }
  return filePath
}

import { Router } from 'express'
import { execSync } from 'child_process'
import type { SessionStore } from '../services/session-store.js'
import type { TabHost, TabProject, TabListResponse, TabSyncResponse } from '@kurimats/shared'
import { PROJECT_COLORS } from '@kurimats/shared'

/**
 * `tab list` コマンドの出力をパースする
 * フォーマット例:
 *   local:
 *     project-a → /path/to/project-a
 *     project-b → /path/to/project-b
 *   remote-host:
 *     project-c → /remote/path/to/project-c
 */
function parseTabListOutput(output: string): TabHost[] {
  const hosts: TabHost[] = []
  let currentHost: TabHost | null = null

  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // ホスト行: "hostname:" 形式
    if (trimmed.endsWith(':') && !trimmed.includes('→')) {
      const hostName = trimmed.slice(0, -1).trim()
      currentHost = {
        name: hostName,
        type: hostName === 'local' || hostName === 'localhost' ? 'local' : 'remote',
        projects: [],
      }
      hosts.push(currentHost)
      continue
    }

    // プロジェクト行: "name → path" 形式
    const arrowMatch = trimmed.match(/^(.+?)\s*[→→>]\s*(.+)$/)
    if (arrowMatch && currentHost) {
      const project: TabProject = {
        name: arrowMatch[1].trim(),
        path: arrowMatch[2].trim(),
      }
      currentHost.projects.push(project)
    }
  }

  return hosts
}

export function createTabRouter(store: SessionStore): Router {
  const router = Router()

  // tab listコマンド実行・パース
  router.get('/list', (_req, res) => {
    try {
      const output = execSync('tab list', {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const hosts = parseTabListOutput(output)
      const response: TabListResponse = { hosts }
      res.json(response)
    } catch (e) {
      console.error('tabコマンド実行エラー:', e)
      // tabコマンドが見つからない場合はダミーデータを返す
      res.json({ hosts: [] } satisfies TabListResponse)
    }
  })

  // tab同期: tabのプロジェクトをkurimatsプロジェクトにインポート
  router.post('/sync', (_req, res) => {
    try {
      let hosts: TabHost[] = []
      try {
        const output = execSync('tab list', {
          encoding: 'utf-8',
          timeout: 5000,
        })
        hosts = parseTabListOutput(output)
      } catch {
        // tabコマンドが利用できない場合
        console.warn('tabコマンドが見つかりません。空のプロジェクト一覧で続行します。')
      }

      const existingProjects = store.getAllProjects()
      const existingNames = new Set(existingProjects.map(p => p.name))

      let created = 0
      let skipped = 0
      const createdProjects = []

      // ホストごとにカラーを割り当て
      const hostColorMap = new Map<string, string>()
      let colorIndex = 0

      for (const host of hosts) {
        // localはblue、リモートは順番にカラー割り当て
        if (host.type === 'local') {
          hostColorMap.set(host.name, '#3b82f6') // blue
        } else {
          const color = PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]
          hostColorMap.set(host.name, color)
          colorIndex++
        }

        for (const tabProject of host.projects) {
          if (existingNames.has(tabProject.name)) {
            skipped++
            continue
          }

          const project = store.createProject({
            name: tabProject.name,
            color: hostColorMap.get(host.name) || '#6b7280',
            repoPath: tabProject.path,
          })
          createdProjects.push(project)
          existingNames.add(tabProject.name)
          created++
        }
      }

      const allProjects = store.getAllProjects()
      const response: TabSyncResponse = {
        created,
        skipped,
        projects: allProjects,
      }
      res.json(response)
    } catch (e) {
      console.error('tab同期エラー:', e)
      res.status(500).json({ error: `tab同期に失敗: ${e}` })
    }
  })

  return router
}

import { Router } from 'express'
import { execFileSync } from 'child_process'
import type { SessionStore } from '../services/session-store.js'
import type { PtyManager } from '../services/pty-manager.js'
import type { SshManager } from '../services/ssh-manager.js'
import type { WorktreeService } from '../services/worktree-service.js'
import type { TabHost, TabProject, TabListResponse, TabSyncResponse, TabBookmark, Session } from '@kurimats/shared'
import { PROJECT_COLORS } from '@kurimats/shared'
import { parseBookmarksToml } from '../services/bookmarks-parser.js'
import { createAndSpawnSession } from '../services/session-lifecycle.js'

/**
 * `tab list` コマンドの出力をパースする
 */
function parseTabListOutput(output: string): TabHost[] {
  const hosts: TabHost[] = []
  let currentHost: TabHost | null = null

  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

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

export function createTabRouter(store: SessionStore, ptyManager: PtyManager, sshManager: SshManager, worktreeService: WorktreeService): Router {
  const router = Router()

  // tab同期のmutex（同時実行防止）
  let isSyncing = false

  // tab listコマンド実行・パース
  router.get('/list', (_req, res) => {
    try {
      const output = execFileSync('tab', ['list'], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const hosts = parseTabListOutput(output)
      const response: TabListResponse = { hosts }
      res.json(response)
    } catch (e) {
      console.error('tabコマンド実行エラー:', e)
      res.json({ hosts: [] } satisfies TabListResponse)
    }
  })

  // bookmarks.toml 直接読み込み
  router.get('/bookmarks', (_req, res) => {
    const bookmarks = parseBookmarksToml()
    res.json({ bookmarks })
  })

  // tab同期: bookmarks.toml → プロジェクト + セッション作成 + Claude起動
  router.post('/sync', async (_req, res) => {
    // 同時実行防止
    if (isSyncing) {
      res.status(409).json({ error: '同期処理が実行中です。しばらくお待ちください。' })
      return
    }
    isSyncing = true
    try {
      // bookmarks.toml からブックマーク一覧を取得
      const bookmarks = parseBookmarksToml()

      // フォールバック: bookmarks.toml が空の場合は tab list を使う
      let hosts: TabHost[] = []
      if (bookmarks.length === 0) {
        try {
          const output = execFileSync('tab', ['list'], {
            encoding: 'utf-8',
            timeout: 5000,
          })
          hosts = parseTabListOutput(output)
        } catch {
          console.warn('tabコマンドが見つかりません。')
        }
      }

      const existingProjects = store.getAllProjects()
      const existingProjectNames = new Set(existingProjects.map(p => p.name))
      const existingSessions = store.getAll()
      // 全ステータスのセッション名で重複チェック（起動のたびに増えるのを防止）
      const existingSessionNames = new Set(
        existingSessions.map(s => s.name)
      )

      let created = 0
      let skipped = 0
      const createdSessions: Session[] = []

      if (bookmarks.length > 0) {
        // bookmarks.toml ベースの同期
        const hostColorMap = new Map<string, string>()
        let colorIndex = 0

        for (const bm of bookmarks) {
          const hostKey = bm.host || 'local'

          // ホストごとのカラー割り当て
          if (!hostColorMap.has(hostKey)) {
            if (hostKey === 'local') {
              hostColorMap.set(hostKey, '#3b82f6')
            } else {
              hostColorMap.set(hostKey, PROJECT_COLORS[colorIndex % PROJECT_COLORS.length])
              colorIndex++
            }
          }

          // プロジェクト作成（未作成の場合のみ）
          if (!existingProjectNames.has(bm.name)) {
            store.createProject({
              name: bm.name,
              color: hostColorMap.get(hostKey) || '#6b7280',
              repoPath: bm.directory,
            })
            existingProjectNames.add(bm.name)
            created++
          } else {
            skipped++
          }

          // セッション作成（同名セッションが存在しない場合のみ）
          if (!existingSessionNames.has(bm.name)) {
            const project = store.getAllProjects().find(p => p.name === bm.name)

            try {
              const session = await createAndSpawnSession(
                store, ptyManager, sshManager, worktreeService,
                {
                  name: bm.name,
                  repoPath: bm.directory,
                  sshHost: bm.host || null,
                  useWorktree: false, // tab syncではworktree不要
                  projectId: project?.id || null,
                  launchClaude: true,
                },
              )
              createdSessions.push(session)
              existingSessionNames.add(bm.name)
            } catch (e) {
              console.error(`セッション ${bm.name} の起動に失敗:`, e)
            }
          }
        }
      } else {
        // tab list ベースの同期（従来互換）
        const hostColorMap = new Map<string, string>()
        let colorIndex = 0

        for (const host of hosts) {
          if (host.type === 'local') {
            hostColorMap.set(host.name, '#3b82f6')
          } else {
            const color = PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]
            hostColorMap.set(host.name, color)
            colorIndex++
          }

          for (const tabProject of host.projects) {
            if (existingProjectNames.has(tabProject.name)) {
              skipped++
              continue
            }

            store.createProject({
              name: tabProject.name,
              color: hostColorMap.get(host.name) || '#6b7280',
              repoPath: tabProject.path,
            })
            existingProjectNames.add(tabProject.name)
            created++
          }
        }
      }

      const allProjects = store.getAllProjects()
      const response: TabSyncResponse = {
        created,
        skipped,
        projects: allProjects,
        sessions: createdSessions,
      }
      res.json(response)
    } catch (e) {
      console.error('tab同期エラー:', e)
      res.status(500).json({ error: `tab同期に失敗: ${e}` })
    } finally {
      isSyncing = false
    }
  })

  return router
}

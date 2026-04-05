/**
 * GitHub Releasesベースの更新チェッカー
 * 起動時に最新リリースを確認し、新バージョンがあればダイアログで通知する
 */

import { app, dialog, shell } from 'electron'
import * as https from 'https'

const GITHUB_OWNER = 'AkiraNagasawa365'
const GITHUB_REPO = 'kurimats-emulator'
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`

interface GitHubRelease {
  tag_name: string
  html_url: string
  name: string
  draft: boolean
  prerelease: boolean
}

/**
 * GitHub APIから最新リリースを取得
 */
function fetchLatestRelease(): Promise<GitHubRelease | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': `kurimats/${app.getVersion()}` },
    }

    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        return
      }

      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(null)
        }
      })
    }).on('error', () => {
      resolve(null)
    })
  })
}

/**
 * タグ名からバージョン部分を抽出（例: "v0.2.0-abc1234" → "0.2.0"）
 */
export function extractVersion(tag: string): string {
  return tag.replace(/^v/, '').replace(/-[a-f0-9]+$/, '')
}

/**
 * セマンティックバージョン比較（a > b なら正、a < b なら負）
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}

/**
 * 更新チェックを実行し、新バージョンがあればダイアログ表示
 */
export async function checkForUpdates(): Promise<void> {
  const release = await fetchLatestRelease()
  if (!release || release.draft || release.prerelease) return

  const currentVersion = app.getVersion()
  const latestVersion = extractVersion(release.tag_name)

  if (compareVersions(latestVersion, currentVersion) <= 0) return

  console.log(`新バージョン検出: ${currentVersion} → ${latestVersion}`)

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '新しいバージョンがあります',
    message: `kurimats ${latestVersion} が利用可能です`,
    detail: `現在のバージョン: ${currentVersion}\n\nリリースページからダウンロードしてください。`,
    buttons: ['ダウンロード', '後で'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response === 0) {
    shell.openExternal(release.html_url || RELEASES_URL)
  }
}

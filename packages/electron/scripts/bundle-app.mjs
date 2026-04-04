/**
 * Electronビルド用バンドルスクリプト
 * クライアント・サーバーのビルド成果物を app-content/ にコピーする
 */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const electronRoot = resolve(__dirname, '..')
const repoRoot = resolve(electronRoot, '../..')
const appContent = resolve(electronRoot, 'app-content')

// クリーンアップ
rmSync(appContent, { recursive: true, force: true })
mkdirSync(appContent, { recursive: true })

// クライアントのビルド成果物をコピー
cpSync(
  resolve(repoRoot, 'packages/client/dist'),
  resolve(appContent, 'client'),
  { recursive: true },
)
console.log('コピー完了: client/dist → app-content/client')

// サーバーのビルド成果物をコピー
cpSync(
  resolve(repoRoot, 'packages/server/dist'),
  resolve(appContent, 'server'),
  { recursive: true },
)

// sharedのビルド成果物もコピー（サーバーが参照する）
mkdirSync(resolve(appContent, 'shared', 'dist'), { recursive: true })
cpSync(
  resolve(repoRoot, 'packages/shared/dist'),
  resolve(appContent, 'shared', 'dist'),
  { recursive: true },
)
cpSync(
  resolve(repoRoot, 'packages/shared/package.json'),
  resolve(appContent, 'shared', 'package.json'),
)

// サーバーの依存関係をルートのnode_modulesから直接コピー
const serverPkg = JSON.parse(readFileSync(resolve(repoRoot, 'packages/server/package.json'), 'utf-8'))
const deps = Object.keys(serverPkg.dependencies || {})
const serverModules = resolve(appContent, 'server', 'node_modules')
mkdirSync(serverModules, { recursive: true })

for (const dep of deps) {
  if (dep.startsWith('@kurimats/')) continue // workspace参照はスキップ
  const src = resolve(repoRoot, 'node_modules', dep)
  const dst = resolve(serverModules, dep)
  try {
    cpSync(src, dst, { recursive: true })
    console.log(`  コピー: ${dep}`)
  } catch {
    console.warn(`  スキップ（見つからない）: ${dep}`)
  }
}

// @kurimats/shared をnode_modulesにコピーし、mainをdistに書き換え
mkdirSync(resolve(serverModules, '@kurimats'), { recursive: true })
cpSync(
  resolve(appContent, 'shared'),
  resolve(serverModules, '@kurimats', 'shared'),
  { recursive: true },
)
// package.json の main を dist 向けに書き換え
const sharedPkgPath = resolve(serverModules, '@kurimats', 'shared', 'package.json')
const sharedPkg = JSON.parse(readFileSync(sharedPkgPath, 'utf-8'))
sharedPkg.main = './dist/index.js'
sharedPkg.types = './dist/index.d.ts'
writeFileSync(sharedPkgPath, JSON.stringify(sharedPkg, null, 2) + '\n')

console.log('バンドル完了: app-content/')

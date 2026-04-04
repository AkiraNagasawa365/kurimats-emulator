/**
 * Electronビルド用バンドルスクリプト
 * クライアント・サーバーのビルド成果物を app-content/ にコピーする
 */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, lstatSync, chmodSync } from 'fs'
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

// pty-helper.py をコピー（node-pty利用不可時のフォールバック用）
cpSync(
  resolve(repoRoot, 'packages/server/src/services/pty-helper.py'),
  resolve(appContent, 'server', 'services', 'pty-helper.py'),
)

// server/package.json をコピー（"type": "module" がESM解決に必要）
cpSync(
  resolve(repoRoot, 'packages/server/package.json'),
  resolve(appContent, 'server', 'package.json'),
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

// サーバーの依存関係をルートのnode_modulesから再帰的にコピー
const serverPkg = JSON.parse(readFileSync(resolve(repoRoot, 'packages/server/package.json'), 'utf-8'))
const topDeps = Object.keys(serverPkg.dependencies || {})
const serverModules = resolve(appContent, 'server', 'node_modules')
mkdirSync(serverModules, { recursive: true })

/**
 * 依存パッケージとそのサブ依存を再帰的にコピーする
 */
function copyDependencyTree(depName, visited = new Set()) {
  if (depName.startsWith('@kurimats/')) return
  if (visited.has(depName)) return
  visited.add(depName)

  const src = resolve(repoRoot, 'node_modules', depName)
  const dst = resolve(serverModules, depName)

  if (!existsSync(src)) {
    console.warn(`  スキップ（見つからない）: ${depName}`)
    return
  }
  if (existsSync(dst)) return // コピー済み

  // スコープ付きパッケージのディレクトリを作成
  if (depName.includes('/')) {
    mkdirSync(resolve(serverModules, depName.split('/')[0]), { recursive: true })
  }

  cpSync(src, dst, { recursive: true, filter: (s) => !lstatSync(s).isSymbolicLink() })
  console.log(`  コピー: ${depName}`)

  // サブ依存を再帰的にコピー
  const pkgPath = resolve(src, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    for (const subDep of Object.keys(pkg.dependencies || {})) {
      copyDependencyTree(subDep, visited)
    }
  }
}

const visited = new Set()
for (const dep of topDeps) {
  copyDependencyTree(dep, visited)
}

// node-ptyのspawn-helperに実行権限を付与（posix_spawnp失敗防止）
const spawnHelperPath = resolve(serverModules, 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
if (existsSync(spawnHelperPath)) {
  chmodSync(spawnHelperPath, 0o755)
  console.log('  実行権限付与: node-pty/spawn-helper')
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

import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const electronDir = path.resolve(__dirname, '../..')

describe('bundle-app.mjsスクリプト', () => {
  const appContentDir = path.join(electronDir, 'app-content')

  it('バンドル実行後にpty-helper.pyが含まれる', () => {
    // bundle-app.mjsが既に実行済みならapp-contentが存在する
    if (!fs.existsSync(appContentDir)) {
      execSync('node scripts/build.mjs && node scripts/bundle-app.mjs', { cwd: electronDir, stdio: 'pipe' })
    }
    const ptyHelperPath = path.join(appContentDir, 'server', 'services', 'pty-helper.py')
    expect(fs.existsSync(ptyHelperPath)).toBe(true)
  })

  it('バンドルにserver/package.jsonが含まれる', () => {
    const pkgPath = path.join(appContentDir, 'server', 'package.json')
    expect(fs.existsSync(pkgPath)).toBe(true)
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.type).toBe('module')
  })

  it('バンドルにexpressのサブ依存(body-parser)が含まれる', () => {
    const bodyParserPath = path.join(appContentDir, 'server', 'node_modules', 'body-parser')
    expect(fs.existsSync(bodyParserPath)).toBe(true)
  })

  it('バンドルにシンボリックリンクが含まれない', () => {
    const findSymlinks = (dir: string): string[] => {
      const results: string[] = []
      if (!fs.existsSync(dir)) return results
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) {
          results.push(fullPath)
        } else if (entry.isDirectory()) {
          results.push(...findSymlinks(fullPath))
        }
      }
      return results
    }
    const symlinks = findSymlinks(path.join(appContentDir, 'server', 'node_modules'))
    expect(symlinks).toEqual([])
  })
})

describe('Electronビルドスクリプト', () => {
  it('esbuildでdist/main.jsが生成される', () => {
    // ビルド実行
    execSync('node scripts/build.mjs', { cwd: electronDir, stdio: 'pipe' })

    const outputPath = path.join(electronDir, 'dist', 'main.js')
    expect(fs.existsSync(outputPath)).toBe(true)
  })

  it('ビルド成果物がCommonJS形式である', () => {
    const outputPath = path.join(electronDir, 'dist', 'main.js')
    const content = fs.readFileSync(outputPath, 'utf-8')

    // CommonJSの特徴的なパターンを確認
    expect(content).toContain('require')
    // electronは外部依存として除外されている
    expect(content).toContain('electron')
  })

  it('ソースマップが生成される', () => {
    const mapPath = path.join(electronDir, 'dist', 'main.js.map')
    expect(fs.existsSync(mapPath)).toBe(true)
  })

  it('package.jsonのmainフィールドがdist/main.jsを指している', () => {
    const pkgPath = path.join(electronDir, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.main).toBe('dist/main.js')
  })
})

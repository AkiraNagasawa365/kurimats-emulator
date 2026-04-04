import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const electronDir = path.resolve(__dirname, '../..')

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

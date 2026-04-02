/**
 * Electronメインプロセスのビルドスクリプト
 * esbuildでTypeScriptをCommonJSにバンドルする
 * electron-store等のESMパッケージもCommonJSに変換される
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outdir: 'dist',
  // Electron本体は外部依存として除外
  external: ['electron'],
  sourcemap: true,
})

console.log('ビルド完了: dist/main.js')

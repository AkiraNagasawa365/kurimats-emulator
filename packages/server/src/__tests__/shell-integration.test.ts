import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PtyManager } from '../services/pty-manager.js'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const servicesDir = path.join(__dir, '..', 'services')

describe('シェル統合', () => {
  // ========================================
  // スクリプトファイルの存在・内容チェック
  // ========================================
  describe('スクリプトファイル', () => {
    it('zsh用スクリプトが存在する', () => {
      expect(existsSync(path.join(servicesDir, 'shell-integration-zsh.sh'))).toBe(true)
    })

    it('bash用スクリプトが存在する', () => {
      expect(existsSync(path.join(servicesDir, 'shell-integration-bash.sh'))).toBe(true)
    })

    it('zsh用スクリプトがOSC 133マーカーを出力する', () => {
      const content = readFileSync(path.join(servicesDir, 'shell-integration-zsh.sh'), 'utf-8')
      // A: プロンプト開始
      expect(content).toContain('133;A')
      // B: ユーザー入力開始
      expect(content).toContain('133;B')
      // C: コマンド実行開始
      expect(content).toContain('133;C')
      // D: コマンド完了
      expect(content).toContain('133;D')
    })

    it('bash用スクリプトがOSC 133マーカーを出力する', () => {
      const content = readFileSync(path.join(servicesDir, 'shell-integration-bash.sh'), 'utf-8')
      expect(content).toContain('133;A')
      expect(content).toContain('133;B')
      expect(content).toContain('133;C')
      expect(content).toContain('133;D')
    })

    it('zsh用スクリプトに二重読み込み防止がある', () => {
      const content = readFileSync(path.join(servicesDir, 'shell-integration-zsh.sh'), 'utf-8')
      expect(content).toContain('KURIMATS_SHELL_INTEGRATION_LOADED')
    })

    it('bash用スクリプトに二重読み込み防止がある', () => {
      const content = readFileSync(path.join(servicesDir, 'shell-integration-bash.sh'), 'utf-8')
      expect(content).toContain('KURIMATS_SHELL_INTEGRATION_LOADED')
    })
  })

  // ========================================
  // PTY起動時のシェル統合注入テスト
  // ========================================
  describe('PTY起動時のシェル統合注入', () => {
    let manager: PtyManager

    beforeEach(() => {
      manager = new PtyManager()
      manager._forceBackend('child_process')
    })

    afterEach(() => {
      manager.killAll()
    })

    it('シェル統合環境変数が設定される', async () => {
      const received: string[] = []
      manager.on('data', (sessionId: string, data: string) => {
        if (sessionId === 'si-env') received.push(data)
      })

      await manager.spawn('si-env', '/tmp', 120, 30, '/bin/sh', ['-c', 'echo SI=$KURIMATS_SHELL_INTEGRATION'])
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const output = received.join('')
      expect(output).toContain('SI=1')
    }, 10000)

    it('zshコマンドでOSC 133マーカーが出力される', async () => {
      // zshが利用可能かチェック
      const zshPath = '/bin/zsh'
      if (!existsSync(zshPath)) return

      const received: string[] = []
      manager.on('data', (sessionId: string, data: string) => {
        if (sessionId === 'si-osc') received.push(data)
      })

      await manager.spawn('si-osc', '/tmp', 120, 30, zshPath)
      // sourceコマンドの実行を待つ
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // コマンドを実行してOSCマーカーが発生するか確認
      manager.write('si-osc', 'echo test\n')
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const output = received.join('')
      // OSC 133マーカー（ESC ] 133 ; X BEL）が含まれるか確認
      // \x1b]133;A\x07 or \x1b]133;C\x07 or \x1b]133;D;0\x07
      const hasOscMarker = output.includes('\x1b]133;')
      expect(hasOscMarker).toBe(true)
    }, 15000)
  })
})

import { describe, it, expect } from 'vitest'

/**
 * PANE_NUMBERベースのポート自動算出ロジックテスト
 *
 * ポートスキーム:
 * | サービス   | 計算式     | main(N=0)     | pane1  | pane2  | pane3  | 本番(Electron) |
 * |-----------|-----------|---------------|--------|--------|--------|---------------|
 * | Server    | 14000+N   | 3001(default) | 14001  | 14002  | 14003  | 13001         |
 * | Client    | 5180+N    | 5173(default) | 5181   | 5182   | 5183   | 5173          |
 * | Playwright| 3550+N    | 3550+連番     | 3551   | 3552   | 3553   | -             |
 */

// サーバーポート算出ロジック（index.tsと同じ）
function calcServerPort(paneNumber: number, envPort?: string): number {
  return paneNumber > 0
    ? 14000 + paneNumber
    : parseInt(envPort || '3001', 10)
}

// クライアントポート算出ロジック（vite.config.tsと同じ）
function calcClientPort(paneNumber: number, envClientPort?: string): number {
  return paneNumber > 0
    ? 5180 + paneNumber
    : parseInt(envClientPort || '5173', 10)
}

// Playwrightポート算出ロジック（pty-manager.tsと同じ）
function calcPlaywrightPort(paneNumber: number, portCounter: number): number {
  return paneNumber > 0
    ? 3550 + paneNumber
    : 3550 + portCounter
}

describe('ポート自動算出', () => {
  describe('サーバーポート', () => {
    it('PANE_NUMBER=1 → 14001', () => {
      expect(calcServerPort(1)).toBe(14001)
    })

    it('PANE_NUMBER=3 → 14003', () => {
      expect(calcServerPort(3)).toBe(14003)
    })

    it('PANE_NUMBER=0 でPORT未設定 → デフォルト3001', () => {
      expect(calcServerPort(0)).toBe(3001)
    })

    it('PANE_NUMBER=0 でPORT=13001 → 13001（既存PORT優先）', () => {
      expect(calcServerPort(0, '13001')).toBe(13001)
    })

    it('PANE_NUMBER > 0 の場合、既存PORTは無視される', () => {
      expect(calcServerPort(3, '13001')).toBe(14003)
    })
  })

  describe('クライアントポート', () => {
    it('PANE_NUMBER=1 → 5181', () => {
      expect(calcClientPort(1)).toBe(5181)
    })

    it('PANE_NUMBER=3 → 5183', () => {
      expect(calcClientPort(3)).toBe(5183)
    })

    it('PANE_NUMBER=0 → デフォルト5173', () => {
      expect(calcClientPort(0)).toBe(5173)
    })

    it('PANE_NUMBER > 0 の場合、既存CLIENT_PORTは無視される', () => {
      expect(calcClientPort(3, '5173')).toBe(5183)
    })
  })

  describe('Playwrightポート', () => {
    it('PANE_NUMBER=1 → 3551', () => {
      expect(calcPlaywrightPort(1, 1)).toBe(3551)
    })

    it('PANE_NUMBER=3 → 3553', () => {
      expect(calcPlaywrightPort(3, 5)).toBe(3553)
    })

    it('PANE_NUMBER=0 → 通し番号ベース（3550+counter）', () => {
      expect(calcPlaywrightPort(0, 1)).toBe(3551)
      expect(calcPlaywrightPort(0, 2)).toBe(3552)
    })
  })

  describe('本番ポートとの衝突なし', () => {
    const PRODUCTION_SERVER_PORT = 13001
    const PRODUCTION_CLIENT_PORT = 5173

    it('全ペインのサーバーポートが本番と衝突しない', () => {
      for (let n = 1; n <= 10; n++) {
        expect(calcServerPort(n)).not.toBe(PRODUCTION_SERVER_PORT)
      }
    })

    it('全ペインのクライアントポートが本番と衝突しない', () => {
      for (let n = 1; n <= 10; n++) {
        expect(calcClientPort(n)).not.toBe(PRODUCTION_CLIENT_PORT)
      }
    })

    it('ペイン間でポートが衝突しない', () => {
      const serverPorts = new Set<number>()
      const clientPorts = new Set<number>()
      for (let n = 1; n <= 10; n++) {
        const sp = calcServerPort(n)
        const cp = calcClientPort(n)
        expect(serverPorts.has(sp)).toBe(false)
        expect(clientPorts.has(cp)).toBe(false)
        serverPorts.add(sp)
        clientPorts.add(cp)
      }
    })
  })
})

/**
 * ポート計算の一元管理（サーバーパッケージ内）
 *
 * | サービス     | ベース | develop(N=0) | pane1 | 本番(Electron) |
 * |-------------|--------|-------------|-------|---------------|
 * | Server      | 14000  | 14000       | 14001 | 13001         |
 * | Client      | 5180   | 5180        | 5181  | 5173          |
 * | Playwright  | 3550   | 3550        | 3551  | -             |
 */

/** サーバーポートベース値 */
export const SERVER_PORT_BASE = 14000

/** Playwright MCPポートベース値 */
export const PLAYWRIGHT_PORT_BASE = 3550

/** クライアントポートベース値 */
export const CLIENT_PORT_BASE = 5180

/**
 * ペイン番号からサービスポートを算出
 */
export function calculatePort(base: number, paneNumber: number): number {
  return base + paneNumber
}

/**
 * スロット番号から全ポートを一括算出
 */
export function calculatePortsForSlot(slotNumber: number): {
  serverPort: number
  clientPort: number
  playwrightPort: number
} {
  return {
    serverPort: calculatePort(SERVER_PORT_BASE, slotNumber),
    clientPort: calculatePort(CLIENT_PORT_BASE, slotNumber),
    playwrightPort: calculatePort(PLAYWRIGHT_PORT_BASE, slotNumber),
  }
}

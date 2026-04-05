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

/**
 * ペイン番号からサービスポートを算出
 */
export function calculatePort(base: number, paneNumber: number): number {
  return base + paneNumber
}

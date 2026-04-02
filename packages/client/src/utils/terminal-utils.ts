/**
 * ターミナル関連ユーティリティ
 * xterm.js の安全な操作をサポートする
 */

/**
 * コンテナが有効なサイズを持っているか判定する
 * xterm.js の fit() はコンテナサイズが0だと dimensions エラーを起こすため
 */
export function hasValidSize(element: HTMLElement): boolean {
  return element.clientWidth > 0 && element.clientHeight > 0
}

/**
 * FitAddonの安全なラッパー
 * コンテナサイズが0の場合やターミナル未初期化時のエラーを防ぐ
 */
export function safeFit(fitAddon: { fit: () => void }, container: HTMLElement): void {
  if (!hasValidSize(container)) return
  try {
    fitAddon.fit()
  } catch {
    // ターミナルが未初期化またはdispose済みの場合は無視
  }
}

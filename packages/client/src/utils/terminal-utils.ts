/**
 * ターミナル関連ユーティリティ
 * xterm.js の安全な操作をサポートする
 */

/**
 * コンテナが有効なサイズを持っているか判定する
 * xterm.js の fit() はコンテナサイズが0だと dimensions エラーを起こすため
 */
export function hasValidSize(element: HTMLElement): boolean {
  if (element.clientWidth <= 0 || element.clientHeight <= 0) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
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

/**
 * xterm.jsの内部APIからセル寸法（CSS px）を取得する
 * 内部APIのため、取得失敗時はnullを返す
 */
export function getCellDimensions(term: unknown): { width: number; height: number } | null {
  try {
    const core = (term as Record<string, unknown>)?._core as Record<string, unknown> | undefined
    const renderService = core?._renderService as Record<string, unknown> | undefined
    const dimensions = renderService?.dimensions as Record<string, unknown> | undefined
    const css = dimensions?.css as Record<string, unknown> | undefined
    const cell = css?.cell as { width: number; height: number } | undefined
    if (cell && typeof cell.width === 'number' && typeof cell.height === 'number') {
      return cell
    }
  } catch {
    // 内部API変更時は静かに失敗
  }
  return null
}

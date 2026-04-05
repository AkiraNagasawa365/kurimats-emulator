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
 * コンテナがユーザーに見えているか判定する
 * ズーム時にopacity-10で隠れたペインのResizeObserverが不正なサイズで
 * fit()を呼ぶのを防ぐ。pointer-events: none の祖先を持つ場合は非表示と判定。
 */
export function isContainerVisible(element: HTMLElement): boolean {
  // テスト環境などでgetComputedStyleが使えない場合は可視とみなす
  if (typeof getComputedStyle !== 'function') return true
  // pointer-events: none の祖先を持つ場合（ズーム時のopacity-10背景）
  let el: HTMLElement | null = element
  while (el) {
    try {
      if (getComputedStyle(el).pointerEvents === 'none') return false
    } catch {
      return true
    }
    el = el.parentElement
  }
  return true
}

/**
 * FitAddonの安全なラッパー
 * コンテナサイズが0の場合、非表示、ターミナル未初期化時のエラーを防ぐ
 */
export function safeFit(fitAddon: { fit: () => void }, container: HTMLElement): void {
  if (!hasValidSize(container)) return
  // ズーム中に隠れたペインで不正なfit()を防止
  if (!isContainerVisible(container)) return
  try {
    fitAddon.fit()
  } catch {
    // ターミナルが未初期化またはdispose済みの場合は無視
  }
}

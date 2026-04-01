/**
 * ウインドウの位置・サイズを永続化するモジュール
 */

/** ウインドウ状態の型定義 */
export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

/** デフォルトのウインドウ状態 */
export const DEFAULT_WINDOW_STATE: WindowState = {
  x: 0,
  y: 0,
  width: 1400,
  height: 900,
  isMaximized: false,
}

/** ストアのインターフェース（electron-storeの抽象化） */
export interface StateStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

/**
 * 保存されたウインドウ状態を読み込む
 * 不正な値の場合はデフォルト値を返す
 */
export function loadWindowState(store: StateStore): WindowState {
  const saved = store.get('windowState') as Partial<WindowState> | undefined

  if (!saved || typeof saved !== 'object') {
    return { ...DEFAULT_WINDOW_STATE }
  }

  return {
    x: isValidNumber(saved.x) ? saved.x! : DEFAULT_WINDOW_STATE.x,
    y: isValidNumber(saved.y) ? saved.y! : DEFAULT_WINDOW_STATE.y,
    width: isValidDimension(saved.width, 400) ? saved.width! : DEFAULT_WINDOW_STATE.width,
    height: isValidDimension(saved.height, 300) ? saved.height! : DEFAULT_WINDOW_STATE.height,
    isMaximized: typeof saved.isMaximized === 'boolean' ? saved.isMaximized : DEFAULT_WINDOW_STATE.isMaximized,
  }
}

/**
 * ウインドウ状態を保存する
 */
export function saveWindowState(store: StateStore, state: WindowState): void {
  store.set('windowState', state)
}

/**
 * BrowserWindowの現在状態からWindowStateを抽出する
 */
export function extractWindowState(window: {
  getBounds(): { x: number; y: number; width: number; height: number }
  isMaximized(): boolean
}): WindowState {
  const bounds = window.getBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
  }
}

/** 有効な数値かどうかを判定する */
function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 有効な寸法（最小値以上）かどうかを判定する */
function isValidDimension(value: unknown, min: number): value is number {
  return isValidNumber(value) && value >= min
}

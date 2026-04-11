/**
 * macOS風キーバインドをターミナル制御シーケンスに変換するユーティリティ
 *
 * xterm.jsはデフォルトでmetaKey（Cmd）付きのキーをブラウザ/OSに委ね、
 * altKey付きの文字キーも特殊文字入力として扱うため、Terminal.app/iTerm2が
 * 行っているような行編集ショートカットがPTYに届かない。
 * この関数で必要なキーだけを拾い、readline互換の制御シーケンスに変換する。
 */

/**
 * macOSプラットフォーム判定
 * Electron/Chromiumどちらからも確実に判定できるようplatform/userAgentを両方見る
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { platform?: string }).platform ?? ''
  if (/Mac/i.test(platform)) return true
  return /Mac/i.test(navigator.userAgent)
}

/**
 * KeyboardEventをターミナルへ送る制御シーケンスに変換する
 *
 * - nullを返した場合、呼び出し側は xterm.js のデフォルト処理に委ねること
 * - 文字列を返した場合、呼び出し側でWebSocket経由でPTYへ送信し、
 *   xterm.js のデフォルト処理を抑制すること（attachCustomKeyEventHandlerなら false を返す）
 *
 * 変換対象（macのみ）:
 * | 入力          | 出力     | 意味                       |
 * |---------------|----------|---------------------------|
 * | Cmd+Backspace | \x15     | Ctrl+U カーソルから行頭まで削除 |
 * | Cmd+←         | \x01     | Ctrl+A 行頭へ移動          |
 * | Cmd+→         | \x05     | Ctrl+E 行末へ移動          |
 * | Opt+Backspace | \x17     | Ctrl+W 前方の単語を削除     |
 * | Opt+←         | \x1bb    | ESC+b 前方の単語へ移動      |
 * | Opt+→         | \x1bf    | ESC+f 次の単語へ移動        |
 *
 * Opt+文字キー（Opt+b → å 等）は意図的に対象外。xtermのデフォルトに委ね、
 * 特殊文字入力ユースケースを温存する。
 */
export function macKeyEventToSequence(
  event: KeyboardEvent,
  isMac: boolean,
): string | null {
  if (!isMac) return null
  if (event.type !== 'keydown') return null

  const { metaKey, altKey, ctrlKey, key } = event

  // Cmd単独（Ctrl/Alt併用は対象外） → 行頭/行末/行頭まで削除
  if (metaKey && !altKey && !ctrlKey) {
    switch (key) {
      case 'Backspace':
        return '\x15' // Ctrl+U: 行頭まで削除
      case 'ArrowLeft':
        return '\x01' // Ctrl+A: 行頭へ
      case 'ArrowRight':
        return '\x05' // Ctrl+E: 行末へ
      default:
        return null
    }
  }

  // Opt(Alt)単独（Cmd/Ctrl併用は対象外） → 単語削除/単語移動
  if (altKey && !metaKey && !ctrlKey) {
    switch (key) {
      case 'Backspace':
        return '\x17' // Ctrl+W: 前方の単語を削除
      case 'ArrowLeft':
        return '\x1bb' // ESC+b: 前方の単語へ
      case 'ArrowRight':
        return '\x1bf' // ESC+f: 次の単語へ
      default:
        return null
    }
  }

  return null
}

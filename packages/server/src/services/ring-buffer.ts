/**
 * リングバッファ — PTY/SSH出力のバッファリングと安全な切り出しを提供する
 * pty-manager / ssh-manager で共通利用
 */

/** デフォルトバッファサイズ: 256KB */
const DEFAULT_BUFFER_SIZE = 256 * 1024

/**
 * 環境変数からバッファサイズを取得（未設定時はデフォルト値）
 */
function resolveMaxSize(maxSize?: number): number {
  if (maxSize != null && maxSize > 0) return maxSize
  const envVal = parseInt(process.env.PTY_BUFFER_SIZE ?? '', 10)
  return envVal > 0 ? envVal : DEFAULT_BUFFER_SIZE
}

/**
 * マルチバイト文字とANSIエスケープの安全な切り出し
 * - サロゲートペアの途中切断を防止
 * - 先頭にSGRリセットを挿入して色化けを防止
 */
function safeSlice(buffer: string, maxSize: number): string {
  if (buffer.length <= maxSize) return buffer

  let sliced = buffer.slice(-maxSize)

  // サロゲートペアの後半（0xDC00〜0xDFFF）で始まる場合は1文字スキップ
  const firstCode = sliced.charCodeAt(0)
  if (firstCode >= 0xDC00 && firstCode <= 0xDFFF) {
    sliced = sliced.slice(1)
  }

  // 不完全なANSIエスケープシーケンスを先頭から除去
  // ESC[ で始まるCSIシーケンスの途中で切れている場合をチェック
  const escIdx = sliced.indexOf('\x1b[')
  if (escIdx === -1 || escIdx > 0) {
    // 先頭が ESC の途中（\x1b があるが [ がない）の場合もスキップ
    if (sliced.charCodeAt(0) === 0x1b) {
      const nextNewline = sliced.indexOf('\n')
      if (nextNewline > 0 && nextNewline < 20) {
        sliced = sliced.slice(nextNewline)
      }
    }
  }

  // SGRリセットを先頭に挿入（途中切断されたスタイルをリセット）
  return '\x1b[0m' + sliced
}

/**
 * セッション出力用リングバッファ
 */
export class RingBuffer {
  private buffer = ''
  private readonly maxSize: number

  constructor(maxSize?: number) {
    this.maxSize = resolveMaxSize(maxSize)
  }

  /** データを追記（上限超過時は自動切り詰め） */
  append(data: string): void {
    this.buffer += data
    if (this.buffer.length > this.maxSize) {
      this.buffer = safeSlice(this.buffer, this.maxSize)
    }
  }

  /** バッファ内容をそのまま取得 */
  getContent(): string {
    return this.buffer
  }

  /** 再接続用: SGRリセット付きで取得 */
  getSafeContent(): string {
    if (this.buffer.length === 0) return ''
    return '\x1b[0m' + this.buffer
  }

  /** バッファをクリア */
  clear(): void {
    this.buffer = ''
  }
}

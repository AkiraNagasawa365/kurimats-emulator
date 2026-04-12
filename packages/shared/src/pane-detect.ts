/**
 * worktreeパス名からペイン番号を自動検出する
 *
 * 検出優先順位:
 * 1. PANE_NUMBER 環境変数（明示的設定を尊重）
 * 2. CWDパスから `-paneN` パターンを抽出
 * 3. どちらも該当しない → null
 */

const PANE_PATTERN = /-pane(\d+)(?:\/|$)/

/**
 * パス文字列からペイン番号を抽出する（純粋関数）
 * @returns ペイン番号 or null
 */
export function extractPaneNumber(dirPath: string): number | null {
  const match = dirPath.match(PANE_PATTERN)
  return match ? parseInt(match[1], 10) : null
}

/**
 * 環境変数 → CWDパス の優先順位でペイン番号を検出する
 * @param env - process.env（テスト時に差し替え可能）
 * @param cwd - カレントディレクトリ（テスト時に差し替え可能）
 * @returns ペイン番号 or null
 */
export function detectPaneNumber(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): number | null {
  // 1. 環境変数が明示的に設定されていれば優先（空文字列・非数値はスキップ）
  if (env.PANE_NUMBER != null && env.PANE_NUMBER !== '') {
    const n = parseInt(env.PANE_NUMBER, 10)
    if (!isNaN(n)) return n
  }
  // 2. CWDのworktreeパスから推定
  return extractPaneNumber(cwd)
}

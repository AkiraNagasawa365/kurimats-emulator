#!/usr/bin/env bash
# gh pr create / gh pr merge 実行直前にフロントエンド変更を検出し、
# Playwright スクショ証跡 (.tmp/playwright/<branch>/*.png) が無ければブロックする
#
# プロジェクト固有フック: kurimats-emulator
# 目的: 「ユニットテストだけで PR を出す/マージする」を物理的に禁止する
# 参考: CLAUDE.md「動作確認時はPlaywrightやbrowser-useでスクショ撮影・操作検証を省略しない」

set -uo pipefail

# === 1. stdin から tool_input.command を抽出 =============================
INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"

# === 2. 対象コマンドで無ければ即通過 =====================================
# gh pr create / gh pr merge にマッチ（単語境界・空白・セミコロン等を許容）
if ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:];&|(])gh[[:space:]]+pr[[:space:]]+(create|merge)([[:space:]]|$)'; then
  exit 0
fi

# === 3. リポジトリルートへ移動 ===========================================
REPO_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT" ]]; then
  exit 0
fi
cd "$REPO_ROOT" || exit 0

# === 4. 現在ブランチ =====================================================
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  exit 0
fi

# === 5. ベースブランチ判定 ===============================================
# --base X または --base=X を拾う（無ければ develop）
BASE="$(printf '%s' "$COMMAND" | grep -oE -- '--base[= ]+[^ ]+' | sed -E 's/^--base[= ]+//' | head -1 || true)"
BASE="${BASE:-develop}"

if git rev-parse --verify --quiet "origin/$BASE" >/dev/null 2>&1; then
  BASE_REF="origin/$BASE"
elif git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; then
  BASE_REF="$BASE"
else
  exit 0  # ベース不明 → 判定不能なのでスキップ
fi

# === 6. フロントエンド変更検出 ===========================================
# packages/client/src/** のうち __tests__/ とテストファイルは除外
CHANGED="$(
  git diff --name-only "$BASE_REF...HEAD" 2>/dev/null \
    | grep -E '^packages/client/src/' \
    | grep -vE '(^|/)__tests__/|\.test\.(ts|tsx)$' \
    || true
)"

if [[ -z "$CHANGED" ]]; then
  exit 0
fi

# === 7. スクショ証跡チェック =============================================
EVIDENCE_DIR=".tmp/playwright/$BRANCH"
if [[ -d "$EVIDENCE_DIR" ]]; then
  if find "$EVIDENCE_DIR" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) 2>/dev/null | read -r _; then
    exit 0
  fi
fi

# === 8. ブロック =========================================================
{
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Playwright 動作確認が未実施のため PR 操作をブロックしました"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo
  echo "フロントエンド変更 (packages/client/src/**) を検出しました:"
  while IFS= read -r f; do
    [[ -n "$f" ]] && echo "  - $f"
  done <<< "$CHANGED"
  echo
  echo "ベース: $BASE_REF / ブランチ: $BRANCH"
  echo
  echo "【対応手順】"
  echo "  1. dev サーバー起動     例: PANE_NUMBER=0 npm run dev"
  echo "  2. Playwright MCP で当該機能を実際に操作・スクショ撮影"
  echo "  3. 証跡を保存           $EVIDENCE_DIR/<任意名>.png"
  echo "  4. 再度 gh pr create / gh pr merge を実行"
  echo
  echo "【UI に影響しないコード変更の場合のみ】バイパスコマンド:"
  echo "  mkdir -p \"$EVIDENCE_DIR\" && touch \"$EVIDENCE_DIR/no-visual-change.png\""
  echo "  ※ 嘘の証跡を作れば通りますが、それは自分を騙しているだけです"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
} >&2

exit 2

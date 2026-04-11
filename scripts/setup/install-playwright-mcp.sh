#!/usr/bin/env bash
# Playwright MCP を launchd 常駐 + HTTP transport で登録するスクリプト
#
# 背景: claude-plugins-official の playwright プラグインが同梱する .mcp.json は
#   stdio 前提の設定だが、@playwright/mcp v0.0.40 以降は HTTP transport
#   デフォルトに変更されており、Claude Code が接続タイムアウトする。
#   このスクリプトは Playwright MCP を HTTP モードで launchd 常駐起動する。
#
# 使い方:
#   bash scripts/setup/install-playwright-mcp.sh        # インストール
#   bash scripts/setup/install-playwright-mcp.sh --uninstall  # アンインストール
#
# 事前要件:
#   - macOS
#   - Homebrew 経由で node/npx がインストール済み

set -euo pipefail

readonly LABEL="com.anthropic.playwright-mcp"
# ポート決定:
#   独立変数 MCP_DAEMON_PORT があれば優先。無ければ 14550 固定。
#   CLAUDE.md の PLAYWRIGHT_MCP_PORT (pane parallel 用) は意図的に無視する
#   ※ 14551+ 帯域は per-pane Playwright 用に予約、14550 は共有デーモン専用
readonly PORT="${MCP_DAEMON_PORT:-14550}"
readonly LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
readonly PLIST_PATH="$LAUNCH_AGENTS_DIR/${LABEL}.plist"
readonly LOG_DIR="$HOME/Library/Logs/playwright-mcp"
readonly TEMPLATE_PATH="$(cd "$(dirname "$0")" && pwd)/playwright-mcp.plist.template"

log_info()  { printf "\033[36m[INFO]\033[0m  %s\n" "$*"; }
log_ok()    { printf "\033[32m[ OK ]\033[0m  %s\n" "$*"; }
log_warn()  { printf "\033[33m[WARN]\033[0m  %s\n" "$*"; }
log_error() { printf "\033[31m[FAIL]\033[0m  %s\n" "$*" >&2; }

uninstall() {
  log_info "アンインストール開始"
  if launchctl list 2>/dev/null | grep -q "$LABEL"; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    log_ok "launchd からアンロード: $LABEL"
  fi
  if [[ -f "$PLIST_PATH" ]]; then
    rm "$PLIST_PATH"
    log_ok "plist 削除: $PLIST_PATH"
  fi
  log_info "アンインストール完了"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

# === 1. 前提チェック =====================================================
log_info "前提条件チェック"
if [[ "$(uname)" != "Darwin" ]]; then
  log_error "このスクリプトは macOS 専用です"
  exit 1
fi

NPX_PATH="$(command -v npx || true)"
if [[ -z "$NPX_PATH" ]]; then
  log_error "npx が見つかりません。Homebrew 等で node をインストールしてください"
  exit 1
fi
log_ok "npx: $NPX_PATH"

# Homebrew prefix を決定
if [[ -x "/opt/homebrew/bin/brew" ]]; then
  HOMEBREW_PREFIX="/opt/homebrew"
elif [[ -x "/usr/local/bin/brew" ]]; then
  HOMEBREW_PREFIX="/usr/local"
else
  HOMEBREW_PREFIX="$(dirname "$(dirname "$NPX_PATH")")"
  log_warn "brew が見つかりません。PATH から推定: $HOMEBREW_PREFIX"
fi
log_ok "Homebrew prefix: $HOMEBREW_PREFIX"

if [[ ! -f "$TEMPLATE_PATH" ]]; then
  log_error "plist テンプレートが見つかりません: $TEMPLATE_PATH"
  exit 1
fi

# === 2. ポート使用状況の確認 =============================================
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log_warn "ポート $PORT は既に使用中です"
  # 既存の同 Label デーモンなら unload して引き継ぐ
  if launchctl list 2>/dev/null | grep -q "$LABEL"; then
    log_info "既存の $LABEL をアンロードして再インストールします"
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
  else
    log_error "別プロセスが $PORT を占有中。停止してから再実行してください"
    exit 1
  fi
fi

# === 3. ディレクトリ作成 =================================================
mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"
log_ok "ログディレクトリ: $LOG_DIR"

# === 4. plist 生成 =======================================================
log_info "plist を生成: $PLIST_PATH"
sed -e "s|@@HOMEBREW_PREFIX@@|$HOMEBREW_PREFIX|g" \
    -e "s|@@NPX_PATH@@|$NPX_PATH|g" \
    -e "s|@@LOG_DIR@@|$LOG_DIR|g" \
    -e "s|@@PORT@@|$PORT|g" \
    "$TEMPLATE_PATH" > "$PLIST_PATH"

# plist の妥当性チェック
if ! plutil -lint "$PLIST_PATH" >/dev/null; then
  log_error "plist の文法エラー"
  exit 1
fi
log_ok "plist 文法 OK"

# === 5. launchd にロード =================================================
log_info "launchd にロード"
launchctl load -w "$PLIST_PATH"
log_ok "ロード完了"

# === 6. 起動待機 & 接続確認 ==============================================
log_info "起動待機 (最大30秒)"
for i in {1..30}; do
  if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    log_ok "ポート $PORT で LISTEN 開始 ($i 秒)"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    log_error "30秒待機してもポート $PORT で LISTEN しません"
    log_error "ログを確認: tail -f $LOG_DIR/playwright-mcp.err.log"
    exit 1
  fi
done

# HTTP 接続確認 (Playwright MCP は Host ヘッダの allowed-hosts チェックを行うため
# localhost 宛で送る必要がある)
log_info "HTTP エンドポイント疎通確認 (http://localhost:${PORT}/mcp)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${PORT}/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"install-script","version":"0.0.1"}}}' || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  log_ok "HTTP initialize 応答 200"
else
  log_warn "HTTP initialize 応答コード: $HTTP_CODE"
  log_info "ログを確認してください: $LOG_DIR/playwright-mcp.err.log"
fi

cat <<EOF

==============================================================
  Playwright MCP インストール完了
==============================================================
  Label     : $LABEL
  Port      : $PORT
  URL       : http://localhost:${PORT}/mcp
  plist     : $PLIST_PATH
  ログ      : $LOG_DIR/

プロジェクトの .mcp.json には以下が登録されます:
  {
    "mcpServers": {
      "playwright": { "url": "http://localhost:${PORT}/mcp" }
    }
  }

次のステップ:
  1. Claude Code で /plugin から claude-plugins-official の
     playwright プラグインを uninstall してください
  2. Claude Code を再起動し /mcp で playwright が Connected を確認

制御コマンド:
  停止  : launchctl unload $PLIST_PATH
  再開  : launchctl load $PLIST_PATH
  削除  : bash $0 --uninstall
  ログ  : tail -f $LOG_DIR/playwright-mcp.err.log
==============================================================
EOF

#!/usr/bin/env bash
# .claude/hooks/verify-playwright.sh の統合テスト
#
# 実行方法:
#   bash .claude/hooks/tests/verify-playwright.test.sh
#
# 各ケースで temp git リポを作成し、各種 stdin payload を流し込んで
# 期待する exit code が返るかを検証する（本物の git/リポジトリ状態に触らない）

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "FAIL: リポジトリルートが取得できません"
  exit 1
fi

HOOK_ABS="$REPO_ROOT/.claude/hooks/verify-playwright.sh"
FIXTURE_DIR="$REPO_ROOT/.claude/hooks/tests/fixtures"

if [[ ! -x "$HOOK_ABS" ]]; then
  echo "FAIL: hook not found or not executable: $HOOK_ABS"
  exit 1
fi

pass=0
fail=0
errors=()

# run_case <name> <fixture-file> <expected-exit> [show-output]
run_case() {
  local name="$1"
  local payload="$FIXTURE_DIR/$2"
  local expected_exit="$3"
  local show_output="${4:-}"
  local repo
  repo="$(mktemp -d)"

  # サブシェルで実行し、本体環境を汚さない
  (
    cd "$repo" || exit 1
    git init -q
    git config user.email t@t.t
    git config user.name t
    git commit --allow-empty -m init -q
    git checkout -b develop -q

    # develop にベースファイル
    mkdir -p packages/client/src/components
    echo "base" > packages/client/src/components/Base.tsx
    git add .
    git commit -m base -q

    # origin/develop を develop と同じ位置に
    git update-ref refs/remotes/origin/develop refs/heads/develop

    # フィーチャーブランチ作成
    git checkout -b "feat/hook-test" -q

    # シナリオ別に状態を構築
    case "$name" in
      block-ui|block-merge-ui)
        echo "change" >> packages/client/src/components/Base.tsx
        git add . && git commit -m "ui change" -q
        ;;
      test-only)
        mkdir -p packages/client/src/__tests__
        echo "test" > packages/client/src/__tests__/foo.test.ts
        git add . && git commit -m "test only" -q
        ;;
      ui-with-evidence)
        echo "change" >> packages/client/src/components/Base.tsx
        git add . && git commit -m "ui change" -q
        mkdir -p ".tmp/playwright/feat/hook-test"
        touch ".tmp/playwright/feat/hook-test/screenshot.png"
        ;;
      backend-only)
        mkdir -p packages/server/src
        echo "srv" > packages/server/src/foo.ts
        git add . && git commit -m "srv" -q
        ;;
      no-command|broken-json|non-target-command|empty)
        : # 追加コミット不要
        ;;
    esac

    # CLAUDE_PROJECT_DIR は本体リポを指しているので外す → git rev-parse フォールバック
    unset CLAUDE_PROJECT_DIR
    if [[ -n "$show_output" ]]; then
      bash "$HOOK_ABS" < "$payload"
    else
      bash "$HOOK_ABS" < "$payload" >/dev/null 2>&1
    fi
  )
  local actual=$?

  if [[ "$actual" -eq "$expected_exit" ]]; then
    printf "  \033[32mPASS\033[0m [%s] exit=%d\n" "$name" "$actual"
    pass=$((pass+1))
  else
    printf "  \033[31mFAIL\033[0m [%s] expected=%d actual=%d\n" "$name" "$expected_exit" "$actual"
    fail=$((fail+1))
    errors+=("$name")
  fi

  rm -rf "$repo"
}

echo "=== verify-playwright.sh 統合テスト ==="
echo

echo "--- ポジティブケース（ブロックされるべき） ---"
run_case "block-ui"         "gh-pr-create.json" 2
run_case "block-merge-ui"   "gh-pr-merge.json"  2

echo
echo "--- ネガティブケース（素通しするべき） ---"
run_case "test-only"        "gh-pr-create.json" 0
run_case "ui-with-evidence" "gh-pr-create.json" 0
run_case "backend-only"     "gh-pr-create.json" 0
run_case "non-target-command" "gh-pr-list.json" 0
run_case "non-target-command" "git-status.json" 0
run_case "empty"            "empty.json"        0
run_case "broken-json"      "broken.json"       0

echo
echo "========================================"
printf "PASS: %d / FAIL: %d\n" "$pass" "$fail"
echo "========================================"
[[ $fail -eq 0 ]]

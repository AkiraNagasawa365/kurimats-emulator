#!/bin/zsh
# kurimats-emulator シェル統合スクリプト (zsh用)
# OSC 133 プロトコルでプロンプト/コマンド状態をターミナルに通知する

# 二重読み込み防止
[[ -n "$KURIMATS_SHELL_INTEGRATION_LOADED" ]] && return
export KURIMATS_SHELL_INTEGRATION_LOADED=1

__kurimats_precmd() {
  local exit_code=$?
  # D: 前コマンド完了（終了コード付き）
  # 初回プロンプト表示時はコマンド未実行なのでスキップ
  if [[ -n "$__kurimats_command_started" ]]; then
    printf '\e]133;D;%s\a' "$exit_code"
    unset __kurimats_command_started
  fi
  # A: プロンプト開始
  printf '\e]133;A\a'
}

__kurimats_preexec() {
  __kurimats_command_started=1
  # C: コマンド実行開始
  printf '\e]133;C\a'
}

# B: ユーザー入力開始（PROMPT末尾に埋め込み）
# %{ %} はzshのプロンプトエスケープでゼロ幅として扱われる
PROMPT="${PROMPT}%{\e]133;B\a%}"

# 既存のhook関数を壊さないようappend
precmd_functions+=(__kurimats_precmd)
preexec_functions+=(__kurimats_preexec)

#!/bin/bash
# kurimats-emulator シェル統合スクリプト (bash用)
# OSC 133 プロトコルでプロンプト/コマンド状態をターミナルに通知する

# 二重読み込み防止
[[ -n "$KURIMATS_SHELL_INTEGRATION_LOADED" ]] && return
export KURIMATS_SHELL_INTEGRATION_LOADED=1

__kurimats_command_started=""

__kurimats_prompt_command() {
  local exit_code=$?
  # D: 前コマンド完了（終了コード付き）
  if [[ -n "$__kurimats_command_started" ]]; then
    printf '\e]133;D;%s\a' "$exit_code"
    __kurimats_command_started=""
  fi
  # A: プロンプト開始
  printf '\e]133;A\a'
}

__kurimats_preexec() {
  # DEBUG trapはすべてのコマンドで発火するが、
  # PROMPT_COMMAND実行中は無視する
  [[ "$BASH_COMMAND" == "$PROMPT_COMMAND" ]] && return
  [[ "$BASH_COMMAND" == __kurimats_* ]] && return
  if [[ -z "$__kurimats_command_started" ]]; then
    __kurimats_command_started=1
    # C: コマンド実行開始
    printf '\e]133;C\a'
  fi
}

# PROMPT_COMMANDの先頭に追加（既存を壊さない）
PROMPT_COMMAND="__kurimats_prompt_command${PROMPT_COMMAND:+;$PROMPT_COMMAND}"

# B: ユーザー入力開始（PS1末尾に埋め込み）
# \[ \] はbashのプロンプトエスケープでゼロ幅として扱われる
PS1="${PS1}\[\e]133;B\a\]"

# DEBUG trapでpreexecを実装
trap '__kurimats_preexec' DEBUG

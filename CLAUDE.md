# CLAUDE.md

## プロジェクト概要

Claude Code並列実行エミュレータ — VS Code的WebアプリでClaude Codeセッションを複数並列管理する。

## アーキテクチャ

TypeScript モノレポ（npm workspaces + Turbo）

| パッケージ | 役割 | 主要技術 |
|-----------|------|---------|
| `shared` | 型定義・WebSocketプロトコル | TypeScript |
| `client` | Webフロントエンド | React 18 + Vite + Zustand + XTerm.js + TailwindCSS |
| `server` | APIサーバー + PTY/SSH管理 | Express 5 + better-sqlite3 + node-pty + ws |
| `electron` | デスクトップラッパー | Electron 33 |

### 通信フロー
- REST API: CRUD操作（`/api/sessions`, `/api/projects` 等）
- WebSocket: ターミナルI/O（`/ws/terminal/:id`）、通知（`/ws/notifications`）

## コマンド

```bash
# 開発（全パッケージ並列起動）
npm run dev

# 個別起動
npm run dev:server   # Express (port 3001)
npm run dev:client   # Vite (port 5173 → proxy to 3001)

# テスト
npx vitest run                              # 全テスト
npx vitest run packages/server              # サーバーのみ
npx vitest run -t "テスト名"                # 特定テスト

# ビルド
npm run build
npm run build:electron   # Electron配布ビルド
```

## 絶対に守るルール

### コード品質
- **DRY原則**: 同一ロジックの重複禁止。共通化して1箇所にまとめる
- **ファイル分割**: 1,000行超は機能別に分割
- **SOLID原則**: 単一責任・依存性注入
- **型安全**: `shared` パッケージで型を一元管理。`any` 禁止

### コーディング規約
- コメント・ログ・エラーメッセージ: **日本語**
- 変数名・関数名: **英語**

### テスト
- 実装には対応するテストを書く
- テスト実行は変更に関連するパッケージのみ（フルスイートは最終確認時のみ）
- コード変更時はテストの期待値も同時に更新する

### Git
- **main への直接コミット・プッシュ禁止** — フィーチャーブランチからPR経由
- **Issueなしでブランチを切らない**
- ブランチ名: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `test/`

### Playwright（並列実行時のポート分離）
- 複数セッションが同時にPlaywrightを使う場合、**ポートが衝突しないようにする**
- kurimats-emulator経由の場合: PTY環境変数 `PLAYWRIGHT_MCP_PORT` が自動設定される（3551〜）
- 手動worktreeで作業する場合: ペイン番号に応じてポートを使い分ける
  - pane1: `3551`, pane2: `3552`, pane3: `3553`, ...
  - 起動例: `PLAYWRIGHT_MCP_PORT=3553 claude`

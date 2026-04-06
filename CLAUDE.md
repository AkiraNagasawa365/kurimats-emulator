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

### ポート分離（並列開発）
- `PANE_NUMBER` 環境変数で全ポートを自動算出（PTYにも伝播）
- **本番(Electron)とは帯域が完全に分離されている**
- **mainブランチでは `npm run dev` しない**（本番ブランチ）

| サービス | 計算式 | develop(N=0) | pane1 | pane2 | pane3 | 本番(Electron) |
|---------|--------|-------------|-------|-------|-------|---------------|
| Server | 14000+N | 14000 | 14001 | 14002 | 14003 | 13001 |
| Client | 5180+N | 5180 | 5181 | 5182 | 5183 | 5173 |
| Playwright | 3550+N | 3550 | 3551 | 3552 | 3553 | - |

- develop起動例: `PANE_NUMBER=0 npm run dev` → Server:14000, Client:5180
- pane起動例: `PANE_NUMBER=3 npm run dev` → Server:14003, Client:5183, Playwright:3553
- kurimats-emulator経由の場合: PTY起動時に `PANE_NUMBER` が自動設定される

### デプロイ手順（Electronデスクトップアプリ）

**デプロイ時は必ずこの手順を上から順に実行すること。省略・順序変更禁止。**

1. **develop → main のPRを作成・マージ**
   ```bash
   gh pr create --base main --head develop --title "release: ..." --body "..."
   gh pr merge <PR番号> --merge
   ```

2. **CIビルド完了を待つ**（`.github/workflows/build-electron.yml` が自動実行）
   ```bash
   gh run list --branch main --limit 1        # run ID確認
   gh run watch <run_id>                       # 完了まで待機（約3分）
   ```

3. **DMGダウンロード**
   ```bash
   gh release list --limit 1                   # タグ確認
   gh release download <tag> --pattern "*.dmg" --dir /private/tmp
   ```

4. **稼働中アプリを終了**
   ```bash
   osascript -e 'quit app "kurimats"'
   sleep 3
   pgrep -f kurimats || echo "終了OK"
   ```

5. **新バージョンをインストール**
   ```bash
   hdiutil attach /private/tmp/kurimats-*.dmg -nobrowse
   rm -rf /Applications/kurimats.app
   cp -R "/Volumes/kurimats */kurimats.app" /Applications/
   xattr -cr /Applications/kurimats.app
   hdiutil detach "/Volumes/kurimats *"
   rm /private/tmp/kurimats-*.dmg
   ```

6. **ローカルビルドを削除**（重要: macOSが古いローカルビルドを優先起動するため）
   ```bash
   rm -rf packages/electron/dist/mac-arm64/kurimats.app
   ```

7. **`/Applications` から起動・パス確認**
   ```bash
   open /Applications/kurimats.app
   sleep 5
   # 必ず /Applications/ から起動されていることを確認
   ps aux | grep "[k]urimats" | grep "node index"
   ```

8. **動作確認**
   ```bash
   curl -s http://localhost:13001/api/ssh/hosts | python3 -m json.tool
   ```
   Playwrightでワークスペース作成等の基本操作を検証する

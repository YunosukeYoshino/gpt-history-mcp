---
last_validated: 2026-09-25
---

# AGENTS.md

ChatGPT のクラウド会話を読む MCP サーバー（Bun、TypeScript、stdio）。ツールの一覧と仕組みは README.md を参照。

## コマンド（Commands）

- `bun test`: テストを実行する。偽の fetch、一時ファイル、インメモリの SQLite だけを使う
- `bunx tsc --noEmit`: 型チェック
- `bun start`: stdio サーバーを起動する

変更したら、両方が通るまで完了にしない。

## 構成（Structure）

- `src/index.ts`: ツールの登録だけを置く。ロジックは持たない
- `src/chatgpt.ts`: 認証、`backendGet`、API レスポンスの正規化（`getConversation` と `searchConversations`）
- `src/catalog.ts`: カタログの SQLite 検索
- `src/linearize.ts`: 会話ツリー（`mapping` と `current_node`）を発言の列に変換
- `src/paths.ts`, `src/time.ts`: `codexHome` と `toIso`

## 守ること（Safety）

- **GET だけ**: backend-api への書き込み系リクエスト（POST、PATCH、DELETE）を追加しない。会話を変更する経路を作らない。
- **Bun の fetch を使う**: curl、Python、node-fetch では Cloudflare に HTML の 403 で弾かれる。HTTP 呼び出しは必ず `backendGet`（`src/chatgpt.ts`）を通す。ヘッダーの `originator: codex_cli_rs` は外さない。
- **トークンを漏らさない**: アクセストークンをログ、エラーメッセージ、ツールの返り値に含めない。`readAuth` の結果をキャッシュしない（Codex が auth.json を更新するため）。
- **カタログは読み取り専用**: `codex-dev.db` は ChatGPT Desktop が書き込み中。`openCatalog` の `readonly: true` を外さない。`missing_candidate = 0` の行だけを対象にする。
- **時刻は Unix 秒**: カタログも API も秒で持つ。ISO への変換は `toIso`（`src/time.ts`）を使う。
- **外部 JSON を信用しない**: API のレスポンス形式は ChatGPT Desktop のバンドルから推測したもので、公式の仕様ではない。フィールドは `typeof` で確かめてから使う（`searchConversations` の書き方に合わせる）。

## テスト

- 実際の `~/.codex/auth.json` や chatgpt.com をテストから触らない。認証は `auth` 引数、HTTP は `fetchImpl` 引数で差し替える。
- 実データでの確認はユーザーに頼む。自動モードでは、auth.json を読むコマンドの実行がブロックされる。

## レスポンス形式を調べるとき

API の形式が変わったら、`/Applications/ChatGPT.app/Contents/Resources/app.asar` を `rg -a` で検索する（例: ``safeGet\(`/conversation``）。展開は不要。

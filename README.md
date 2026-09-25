# chat-mcp

ChatGPT のクラウド会話を検索して、本文を読むための MCP サーバー（stdio）です。
エクスポートやスクレイピングは使いません。ChatGPT Desktop が同期しているカタログと、ChatGPT 本体の API を直接読みます。

> [!WARNING]
> `chatgpt.com/backend-api` は非公開の API です。予告なく仕様が変わる可能性があり、利用規約上もグレーです。
> 自分のアカウントで、読み取りだけに使ってください。配布や公開、一括ダウンロードの用途には使わないでください。

## 前提（Prerequisites）

- macOS に ChatGPT Desktop（Codex 統合版）が入っていて、同期済みであること
- `~/.codex/auth.json` に ChatGPT ログインのトークンがあること（`codex login` で ChatGPT アカウントにログインすると作られます）
- [Bun](https://bun.sh) 1.4 以上

## セットアップ（Setup）

```sh
bun install
claude mcp add chat-mcp -- bun "$(pwd)/src/index.ts"
```

ほかの MCP クライアントで使う場合は、起動コマンドに `bun /path/to/chat-mcp/src/index.ts` を指定してください。

## 使い方（Usage）

| ツール | 入力 | 返り値 | データ源 |
|---|---|---|---|
| `search_chatgpt_chats` | `query`, `limit`（既定 20） | `[{id, title, created_at, updated_at}]` | ローカルのカタログ（ネットワークなし） |
| `search_chatgpt_messages` | `query`, `cursor?` | `{results: [{id, title, snippet, updated_at, archived}], next_cursor}` | `GET /backend-api/conversations/search` |
| `get_chatgpt_chat` | `id` | `{id, title, messages: [{role, content, create_time}]}` | `GET /backend-api/conversation/{id}` |

- `search_chatgpt_chats` はタイトルだけを対象にします。スペース区切りの語をすべて含むものを返し（AND 検索）、空のクエリなら最近の会話を返します。
- 本文まで探したいときは `search_chatgpt_messages` を使います。
- `get_chatgpt_chat` は、画面に表示されているブランチの user と assistant の発言だけを返します。system、tool、非表示のメッセージは除きます。

使い方の例: 「ChatGPT で ICP について話した会話を探して、要点をまとめて」

## 仕組み

```text
~/.codex/sqlite/codex-dev.db          ~/.codex/auth.json
  local_thread_catalog                  tokens.access_token
  (source_kind = 'chatgpt')                   │
        │                                     ▼
  search_chatgpt_chats           chatgpt.com/backend-api  (Bun fetch)
                                   ├─ conversations/search → search_chatgpt_messages
                                   └─ conversation/{id}    → get_chatgpt_chat
```

- カタログは ChatGPT Desktop が書き込み中の SQLite です。読み取り専用で開きます。
- トークンは Codex が更新するため、リクエストのたびに auth.json を読み直します。
- 環境変数 `CODEX_HOME` を設定すると、`~/.codex` の代わりにそのディレクトリを使います。

## トラブルシューティング

| エラー | 原因と対処 |
|---|---|
| `401` | トークンの期限切れです。Codex を起動するか、`codex login` を実行してください。 |
| `403（HTML）` | Cloudflare にブロックされています。Bun 以外のランタイムで動かしていないか確認してください。 |
| `auth.json が見つかりません` | `codex login` で ChatGPT アカウントにログインしてください。 |

## 開発（Development）

```sh
bun test            # ユニットテスト（実際の API や認証情報は使わない）
bunx tsc --noEmit   # 型チェック
bun start           # stdio サーバーを起動（MCP クライアント経由で使うのが普通）
```

## 構成（Structure）

```text
src/
├── index.ts      MCP サーバーとツールの登録
├── catalog.ts    カタログの検索（bun:sqlite、読み取り専用）
├── chatgpt.ts    認証の読み込み、backend-api の GET、検索結果と会話の正規化
├── linearize.ts  会話ツリーを時系列の発言に変換
├── paths.ts      CODEX_HOME の解決
└── time.ts       Unix 秒を ISO 8601 に変換
test/             bun test（フィクスチャ、偽の fetch、一時ファイル）
```

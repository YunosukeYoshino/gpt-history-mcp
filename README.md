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
```

続けて、使う MCP クライアントに登録します。以下の例の `/path/to/chat-mcp` はこのリポジトリの絶対パスに置き換えてください。
GUI アプリは PATH を引き継がないことがあるので、`bun` も `which bun` で調べた絶対パス（例: `/usr/local/bin/bun`）で書くと確実です。

### Claude Code

```sh
# 全プロジェクトで使う
claude mcp add --scope user chat-mcp -- bun /path/to/chat-mcp/src/index.ts
```

プロジェクト単位で共有したい場合は、そのプロジェクトのルートに `.mcp.json` を置きます。

```json
{
  "mcpServers": {
    "chat-mcp": {
      "command": "bun",
      "args": ["/path/to/chat-mcp/src/index.ts"]
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` に追記して、アプリを再起動します。

```json
{
  "mcpServers": {
    "chat-mcp": {
      "command": "/usr/local/bin/bun",
      "args": ["/path/to/chat-mcp/src/index.ts"]
    }
  }
}
```

### Codex（CLI と ChatGPT Desktop）

`~/.codex/config.toml` に追記します。

```toml
[mcp_servers.chat-mcp]
command = "/usr/local/bin/bun"
args = ["/path/to/chat-mcp/src/index.ts"]
```

### Cursor

`~/.cursor/mcp.json`（プロジェクト単位なら `.cursor/mcp.json`）に、Claude Desktop と同じ形式で `mcpServers` を書きます。

### 確認

登録したら、クライアントから `search_chatgpt_chats` を空のクエリで呼び、最近の会話が返るか確かめます。
単体で確認したい場合は MCP Inspector を使います。

```sh
bunx @modelcontextprotocol/inspector bun /path/to/chat-mcp/src/index.ts
```

環境変数 `CODEX_HOME` を使っている場合は、各設定の `env` にも同じ値を渡してください。

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

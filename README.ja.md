# chatgpt-mcp

[English](README.md) | 日本語

AI アシスタントから **ChatGPT の会話を検索して、本文を読める**ようにする MCP サーバー（stdio）です。

データのエクスポートやスクレイピングは使いません。ChatGPT デスクトップアプリがディスクに同期している会話カタログを読み、本文は必要なときに ChatGPT から取得します。

```text
あなた: ChatGPT で ICP について話した会話を探して、要約して
Claude: → search_chatgpt_messages("ICP") → get_chatgpt_chat("6aa…") → 要約
```

> [!WARNING]
> このプロジェクトは、**公開されていない内部 API** の `chatgpt.com/backend-api` を使います。予告なく仕様が変わったり動かなくなったりする可能性があります。また、自動アクセスは OpenAI の利用規約に抵触するおそれがあります。
> 自分のアカウントで、読み取りだけに、人が操作するくらいの頻度で使ってください。一括ダウンロードには使わないでください。
> このプロジェクトは OpenAI とは無関係で、OpenAI の承認も受けていません。

## 特長

- **タイトル検索（オフライン）**: ChatGPT デスクトップアプリが手元に持っているカタログを検索します
- **全文検索**: ChatGPT 自身の検索でメッセージ本文まで探し、ヒット箇所の抜粋も返します
- **会話の読み込み**: 表示中のブランチを、`user` と `assistant` だけのきれいな発言列で返します
- **読み取り専用の設計**: `GET` リクエストしか送りません。ローカル DB は読み取り専用で開きます。トークンをログや出力に出しません。

## 必要なもの

- macOS と、**ChatGPT デスクトップアプリ**（Codex 統合版）。ログイン済みで、同期が済んでいること
- ChatGPT ログインが入った `~/.codex/auth.json`。`codex login` を実行し、ChatGPT アカウントでログインすると作られます。
- [Bun](https://bun.sh) 1.4 以上。サーバーは必ず Bun で動かしてください。ほかの HTTP クライアントは Cloudflare にブロックされます。

## インストール

```sh
git clone https://github.com/YunosukeYoshino/chatgpt-mcp.git
cd chatgpt-mcp
bun install
```

続けて、使う MCP クライアントに登録します。以下の例の `/path/to/chatgpt-mcp` は、クローンした場所の絶対パスに置き換えてください。
GUI アプリはシェルの `PATH` を引き継がないことがあります。GUI アプリの設定では `bun` も絶対パスで書いてください（`which bun` で調べられます。例: `/usr/local/bin/bun`）。

### Claude Code

```sh
claude mcp add --scope user chatgpt-mcp -- bun /path/to/chatgpt-mcp/src/index.ts
```

特定のプロジェクトだけで使う場合は、そのプロジェクトのルートに次の `.mcp.json` を置きます。

```json
{
  "mcpServers": {
    "chatgpt-mcp": {
      "command": "bun",
      "args": ["/path/to/chatgpt-mcp/src/index.ts"]
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` に追記して、アプリを再起動します。

```json
{
  "mcpServers": {
    "chatgpt-mcp": {
      "command": "/usr/local/bin/bun",
      "args": ["/path/to/chatgpt-mcp/src/index.ts"]
    }
  }
}
```

### Codex（CLI と ChatGPT デスクトップ）

`~/.codex/config.toml` に追記します。

```toml
[mcp_servers.chatgpt-mcp]
command = "/usr/local/bin/bun"
args = ["/path/to/chatgpt-mcp/src/index.ts"]
```

### Cursor

Claude Desktop と同じ `mcpServers` の JSON を、`~/.cursor/mcp.json`（プロジェクト単位なら `.cursor/mcp.json`）に書きます。

### 動作確認

クライアントから `search_chatgpt_chats` を空のクエリで呼び、最近の会話が返ってくれば成功です。
サーバー単体で確かめたいときは、MCP Inspector を使います。

```sh
bunx @modelcontextprotocol/inspector bun /path/to/chatgpt-mcp/src/index.ts
```

## ツール

| ツール | 入力 | 出力 | データ源 |
|---|---|---|---|
| `search_chatgpt_chats` | `query`, `limit`（既定 20） | `[{id, title, created_at, updated_at}]` | ローカルのカタログ（ネットワークなし） |
| `search_chatgpt_messages` | `query`, `cursor?` | `{results: [{id, title, snippet, updated_at, archived}], next_cursor}` | `GET /backend-api/conversations/search` |
| `get_chatgpt_chat` | `id` | `{id, title, messages: [{role, content, create_time}]}` | `GET /backend-api/conversation/{id}` |

- `search_chatgpt_chats` はタイトルだけを対象にします。スペース区切りの語をすべて含むものを返し、空のクエリなら最近の会話を返します。
- `search_chatgpt_messages` はメッセージ本文も検索します。タイトルでは見つからないときに使います。
- `get_chatgpt_chat` は、ChatGPT で今表示されているブランチだけを返します。system、tool、非表示のメッセージは除きます。

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

- カタログの DB には、ChatGPT デスクトップアプリが起動中も書き込んでいます。そのため chatgpt-mcp は読み取り専用で開きます。
- `auth.json` のトークンは Codex が更新します。そのため chatgpt-mcp はリクエストのたびにファイルを読み直します。

## 設定

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `CODEX_HOME` | `~/.codex` | `auth.json` と `sqlite/codex-dev.db` を探す場所。クライアントの `env` 設定で渡します。 |

## トラブルシューティング

| エラー | 原因と対処 |
|---|---|
| `401` | トークンの期限切れです。ChatGPT デスクトップアプリか Codex を開くか、`codex login` を実行してください。 |
| `403 (HTML)` | Cloudflare にブロックされています。サーバーを Bun で動かしているか確認してください。 |
| `auth.json not found` / `no ChatGPT token` | `codex login` で ChatGPT アカウントにログインしてください（API キーでのログインでは足りません）。 |
| `unable to open database file` | ChatGPT デスクトップアプリがまだ同期していないか、`CODEX_HOME` が別の場所を指しています。 |

## 開発

```sh
bun test            # ユニットテスト。実際の API や認証情報には触れません
bunx tsc --noEmit   # 型チェック
bun start           # stdio サーバーを起動（普通は MCP クライアントが起動します）
```

```text
src/
├── index.ts      MCP サーバーとツールの登録
├── catalog.ts    カタログの検索（bun:sqlite、読み取り専用）
├── chatgpt.ts    認証の読み込み、GET 専用の backend-api クライアント、レスポンスの正規化
├── linearize.ts  会話ツリーを時系列の発言に変換
├── paths.ts      CODEX_HOME の解決
└── time.ts       Unix 秒を ISO 8601 に変換
test/             bun test（フィクスチャ、偽の fetch、一時ファイル）
```

コントリビューターとエージェント向けのガイドラインは [AGENTS.md](AGENTS.md) にあります。

## ライセンス

[MIT](LICENSE)

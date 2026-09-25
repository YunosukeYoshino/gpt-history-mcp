#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openCatalog, searchCatalog } from "./catalog.ts";
import { getConversation, searchConversations } from "./chatgpt.ts";

const server = new McpServer({ name: "chat-mcp", version: "0.1.0" });
const readOnly = { readOnlyHint: true, openWorldHint: true } as const;
const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

server.registerTool(
  "search_chatgpt_chats",
  {
    description:
      "ChatGPT のクラウド会話をタイトルで検索する（ローカルの Codex カタログを使い、ネットワークは使わない）。空クエリなら最近の会話を返す。",
    inputSchema: {
      query: z.string().describe("タイトルに含まれる語。スペース区切りで AND 検索"),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, limit }) => {
    const db = openCatalog();
    try {
      return json(searchCatalog(db, query, limit));
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "get_chatgpt_chat",
  {
    description: "ChatGPT の会話本文を取得する。表示中のブランチの user/assistant の発言を時系列で返す。",
    inputSchema: { id: z.string().min(1).describe("conversation ID（search_* の id）") },
    annotations: readOnly,
  },
  async ({ id }) => json(await getConversation(id)),
);

server.registerTool(
  "search_chatgpt_messages",
  {
    description: "ChatGPT の会話をメッセージ本文も含めて全文検索する（ChatGPT の検索 API を使う）。",
    inputSchema: {
      query: z.string().min(1),
      cursor: z.string().optional().describe("前回の結果の next_cursor"),
    },
    annotations: readOnly,
  },
  async ({ query, cursor }) => json(await searchConversations(query, cursor)),
);

await server.connect(new StdioServerTransport());

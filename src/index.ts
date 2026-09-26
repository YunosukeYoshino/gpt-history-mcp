#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openCatalog, searchCatalog } from "./catalog.ts";
import { getConversation, searchConversations } from "./chatgpt.ts";

const server = new McpServer({ name: "gpt-history-mcp", version: "0.1.0" });
const readOnly = { readOnlyHint: true, openWorldHint: true } as const;
const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

server.registerTool(
  "search_chatgpt_chats",
  {
    description:
      "Search ChatGPT conversations by title using the local Codex catalog (no network). An empty query lists the most recent chats.",
    inputSchema: {
      query: z.string().describe("Words in the title. All space-separated words must match."),
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
    description: "Read a ChatGPT conversation. Returns the user/assistant messages of the visible branch in chronological order.",
    inputSchema: { id: z.string().min(1).describe("Conversation ID (the id returned by search_* tools)") },
    annotations: readOnly,
  },
  async ({ id }) => json(await getConversation(id)),
);

server.registerTool(
  "search_chatgpt_messages",
  {
    description: "Full-text search over ChatGPT conversations, including message bodies, via ChatGPT's search API.",
    inputSchema: {
      query: z.string().min(1),
      cursor: z.string().optional().describe("next_cursor from the previous result"),
    },
    annotations: readOnly,
  },
  async ({ query, cursor }) => json(await searchConversations(query, cursor)),
);

await server.connect(new StdioServerTransport());

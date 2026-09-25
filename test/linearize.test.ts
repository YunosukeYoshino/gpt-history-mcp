import { expect, test } from "bun:test";
import { linearize } from "../src/linearize.ts";

const node = (
  id: string,
  parent: string | null,
  role: string | null,
  parts: unknown[] = [],
  extra: Record<string, unknown> = {},
) => ({
  id,
  parent,
  children: [],
  message:
    role === null
      ? null
      : {
          author: { role },
          create_time: 1790000000,
          content: { content_type: "text", parts },
          metadata: {},
          ...extra,
        },
});

test("follows current_node back to root and returns user/assistant text in order", () => {
  const conversation = {
    current_node: "a2",
    mapping: {
      root: node("root", null, null),
      sys: node("sys", "root", "system", [""]),
      u1: node("u1", "sys", "user", ["MCPとは？"]),
      a1: node("a1", "u1", "assistant", ["Model Context Protocol です"]),
      u2: node("u2", "a1", "user", ["SQLite は？"]),
      a2: node("a2", "u2", "assistant", ["使えます"]),
    },
  };

  expect(linearize(conversation)).toEqual([
    { role: "user", content: "MCPとは？", create_time: 1790000000 },
    { role: "assistant", content: "Model Context Protocol です", create_time: 1790000000 },
    { role: "user", content: "SQLite は？", create_time: 1790000000 },
    { role: "assistant", content: "使えます", create_time: 1790000000 },
  ]);
});

test("ignores abandoned branches not on the current path", () => {
  const conversation = {
    current_node: "a1b",
    mapping: {
      u1: node("u1", null, "user", ["質問"]),
      a1a: node("a1a", "u1", "assistant", ["古い回答"]),
      a1b: node("a1b", "u1", "assistant", ["再生成した回答"]),
    },
  };

  expect(linearize(conversation).map((m) => m.content)).toEqual(["質問", "再生成した回答"]);
});

test("drops tool messages, hidden messages, empty text and non-string parts", () => {
  const conversation = {
    current_node: "a1",
    mapping: {
      u1: node("u1", null, "user", ["画像つき", { asset_pointer: "file-service://x" }]),
      t1: node("t1", "u1", "tool", ["検索結果"]),
      h1: node("h1", "t1", "assistant", ["内部"], {
        metadata: { is_visually_hidden_from_conversation: true },
      }),
      e1: node("e1", "h1", "assistant", [""]),
      a1: node("a1", "e1", "assistant", ["回答"]),
    },
  };

  expect(linearize(conversation).map((m) => [m.role, m.content])).toEqual([
    ["user", "画像つき"],
    ["assistant", "回答"],
  ]);
});

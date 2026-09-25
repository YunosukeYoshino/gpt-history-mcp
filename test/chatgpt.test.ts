import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendGet, readAuth, searchConversations } from "../src/chatgpt.ts";

const auth = { accessToken: "secret-token", accountId: "acct-1" };

const fakeFetch = (status: number, body: string, contentType = "application/json") => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string> });
    return new Response(body, { status, headers: { "content-type": contentType } });
  }) as unknown as typeof fetch;
  return { impl, calls };
};

test("sends bearer token, account id and codex originator to chatgpt.com backend-api", async () => {
  const { impl, calls } = fakeFetch(200, '{"title":"x"}');
  expect(await backendGet<{ title: string }>("/conversation/abc", { auth, fetchImpl: impl })).toEqual({ title: "x" });
  expect(calls[0]?.url).toBe("https://chatgpt.com/backend-api/conversation/abc");
  expect(calls[0]?.headers).toMatchObject({
    Authorization: "Bearer secret-token",
    "ChatGPT-Account-ID": "acct-1",
    originator: "codex_cli_rs",
  });
});

test("explains 401 as an expired Codex login without leaking the token", async () => {
  const { impl } = fakeFetch(401, '{"detail":"secret-token is invalid"}');
  const error = await backendGet("/conversation/abc", { auth, fetchImpl: impl }).catch((e: Error) => e);
  expect(String(error)).toContain("401");
  expect(String(error)).toContain("codex login");
  expect(String(error)).not.toContain("secret-token");
});

test("recognizes an HTML 403 as a Cloudflare block", async () => {
  const { impl } = fakeFetch(403, "<html>challenge</html>", "text/html");
  const error = await backendGet("/conversation/abc", { auth, fetchImpl: impl }).catch((e: Error) => e);
  expect(String(error)).toContain("Cloudflare");
});

test("reports JSON 404 with the API detail", async () => {
  const { impl } = fakeFetch(404, '{"detail":"Conversation not found"}');
  const error = await backendGet("/conversation/abc", { auth, fetchImpl: impl }).catch((e: Error) => e);
  expect(String(error)).toContain("404");
  expect(String(error)).toContain("Conversation not found");
});

const authFile = (content: string) => {
  const path = join(mkdtempSync(join(tmpdir(), "chat-mcp-")), "auth.json");
  writeFileSync(path, content);
  return path;
};

test("readAuth re-reads the file on every call so tokens refreshed by Codex are picked up", async () => {
  const path = authFile(JSON.stringify({ tokens: { access_token: "old" } }));
  expect((await readAuth(path)).accessToken).toBe("old");
  writeFileSync(path, JSON.stringify({ tokens: { access_token: "new", account_id: "acct-1" } }));
  expect(await readAuth(path)).toEqual({ accessToken: "new", accountId: "acct-1" });
});

test("readAuth ignores a non-string account_id", async () => {
  const path = authFile(JSON.stringify({ tokens: { access_token: "t", account_id: 42 } }));
  expect(await readAuth(path)).toEqual({ accessToken: "t", accountId: undefined });
});

test("readAuth asks for codex login when the file or the token is missing", async () => {
  const missing = await readAuth("/nonexistent/auth.json").catch((e: Error) => e);
  expect(String(missing)).toContain("codex login");
  const apiKeyOnly = await readAuth(authFile(JSON.stringify({ OPENAI_API_KEY: "sk-x" }))).catch((e: Error) => e);
  expect(String(apiKeyOnly)).toContain("codex login");
});

test("searchConversations normalizes items and drops ones without a string conversation_id", async () => {
  const { impl, calls } = fakeFetch(
    200,
    JSON.stringify({
      items: [
        { conversation_id: "c1", title: "MCP", update_time: 1790000000, is_archived: false, payload: { snippet: "…MCP…" } },
        { conversation_id: "c2", title: null, update_time: null },
        { conversation_id: 3, title: "壊れた行" },
      ],
      cursor: "next",
    }),
  );
  expect(await searchConversations("MCP SQLite", "cur", { auth, fetchImpl: impl })).toEqual({
    results: [
      { id: "c1", title: "MCP", snippet: "…MCP…", updated_at: "2026-09-21T14:13:20.000Z", archived: false },
      { id: "c2", title: null, snippet: null, updated_at: null, archived: false },
    ],
    next_cursor: "next",
  });
  expect(calls[0]?.url).toBe("https://chatgpt.com/backend-api/conversations/search?query=MCP+SQLite&cursor=cur");
});

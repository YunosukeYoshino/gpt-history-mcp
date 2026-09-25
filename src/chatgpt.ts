import { join } from "node:path";
import { linearize, type ChatMessage, type RawConversation } from "./linearize.ts";
import { codexHome } from "./paths.ts";
import { toIso } from "./time.ts";

const BASE_URL = "https://chatgpt.com/backend-api";

export type Auth = { accessToken: string; accountId?: string };

// Re-read on every call: Codex refreshes the token in place.
export async function readAuth(path = join(codexHome(), "auth.json")): Promise<Auth> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`auth.json not found at ${path}. Run \`codex login\` and sign in with ChatGPT.`);
  const tokens = (await file.json())?.tokens;
  if (typeof tokens?.access_token !== "string") {
    throw new Error(`no ChatGPT token in ${path}. Run \`codex login\` and sign in with ChatGPT.`);
  }
  return { accessToken: tokens.access_token, accountId: typeof tokens.account_id === "string" ? tokens.account_id : undefined };
}

type RequestOptions = { auth?: Auth; fetchImpl?: typeof fetch };

// Only GET is exposed on purpose: this server must never modify conversations.
// Must run on Bun's fetch; curl / Python clients get an HTML 403 from Cloudflare.
export async function backendGet<T = unknown>(path: string, { auth, fetchImpl = fetch }: RequestOptions = {}): Promise<T> {
  const { accessToken, accountId } = auth ?? (await readAuth());
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    originator: "codex_cli_rs",
    Accept: "application/json",
  };
  if (accountId) headers["ChatGPT-Account-ID"] = accountId;

  const res = await fetchImpl(`${BASE_URL}${path}`, { headers });
  if (res.ok) return (await res.json()) as T;

  if (res.status === 401) {
    throw new Error("ChatGPT API returned 401: the token has expired. Open ChatGPT desktop or Codex, or run `codex login`.");
  }
  if (!res.headers.get("content-type")?.includes("json")) {
    throw new Error(`ChatGPT API returned ${res.status} (HTML): probably blocked by Cloudflare. Make sure the server runs on Bun.`);
  }
  const detail = await res.json().then((b) => (b as { detail?: unknown } | null)?.detail, () => undefined);
  throw new Error(`ChatGPT API returned ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function getConversation(
  id: string,
  options?: RequestOptions,
): Promise<{ id: string; title: string | null; messages: ChatMessage[] }> {
  const conversation = await backendGet<RawConversation & { title?: unknown }>(
    `/conversation/${encodeURIComponent(id)}`,
    options,
  );
  return { id, title: str(conversation.title), messages: linearize(conversation) };
}

export type SearchResult = {
  id: string;
  title: string | null;
  snippet: string | null;
  updated_at: string | null;
  archived: boolean;
};

type RawSearchItem = {
  conversation_id?: unknown;
  title?: unknown;
  update_time?: unknown;
  is_archived?: unknown;
  payload?: { snippet?: unknown } | null;
};

// Response shape inferred from the ChatGPT Desktop bundle, not a documented API: validate every field.
export async function searchConversations(
  query: string,
  cursor?: string,
  options?: RequestOptions,
): Promise<{ results: SearchResult[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ query });
  if (cursor) params.set("cursor", cursor);
  const res = await backendGet<{ items?: unknown; cursor?: unknown }>(`/conversations/search?${params}`, options);
  const items = Array.isArray(res.items) ? (res.items as RawSearchItem[]) : [];
  return {
    results: items.flatMap((item) =>
      typeof item.conversation_id === "string"
        ? [
            {
              id: item.conversation_id,
              title: str(item.title),
              snippet: str(item.payload?.snippet),
              updated_at: typeof item.update_time === "number" ? toIso(item.update_time) : null,
              archived: item.is_archived === true,
            },
          ]
        : [],
    ),
    next_cursor: str(res.cursor),
  };
}

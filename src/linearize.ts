export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  create_time: number | null;
};

type RawNode = {
  parent?: string | null;
  message?: {
    author?: { role?: string };
    create_time?: number | null;
    content?: { parts?: unknown[] };
    metadata?: { is_visually_hidden_from_conversation?: boolean };
  } | null;
};

export type RawConversation = {
  current_node?: string | null;
  mapping?: Record<string, RawNode>;
};

// ChatGPT stores a conversation as a tree; the visible thread is the path from current_node up to the root.
export function linearize(conversation: RawConversation): ChatMessage[] {
  const mapping = conversation.mapping ?? {};
  const path: RawNode[] = [];
  const seen = new Set<string>();
  let id = conversation.current_node;
  while (id && !seen.has(id)) {
    const node = mapping[id];
    if (!node) break;
    seen.add(id);
    path.push(node);
    id = node.parent;
  }

  const messages: ChatMessage[] = [];
  for (const { message } of path.reverse()) {
    const role = message?.author?.role;
    if (role !== "user" && role !== "assistant") continue;
    if (message?.metadata?.is_visually_hidden_from_conversation) continue;
    const content = (message?.content?.parts ?? [])
      .filter((part): part is string => typeof part === "string")
      .join("\n")
      .trim();
    if (!content) continue;
    messages.push({ role, content, create_time: message?.create_time ?? null });
  }
  return messages;
}

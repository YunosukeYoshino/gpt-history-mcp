import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

export type CatalogEntry = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export const codexHome = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");

// ChatGPT Desktop keeps writing to this DB (WAL), so open it read-only and never write.
export function openCatalog(path = join(codexHome(), "sqlite", "codex-dev.db")) {
  return new Database(path, { readonly: true });
}

const toIso = (seconds: number) => new Date(seconds * 1000).toISOString();
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchCatalog(db: Database, query: string, limit: number): CatalogEntry[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const where = words.map(() => "AND display_title LIKE ? ESCAPE '\\'").join(" ");
  const rows = db
    .query<
      { thread_id: string; display_title: string; source_created_at: number; source_updated_at: number },
      (string | number)[]
    >(
      `SELECT thread_id, display_title, source_created_at, source_updated_at
       FROM local_thread_catalog
       WHERE source_kind = 'chatgpt' AND missing_candidate = 0 ${where}
       ORDER BY source_recency_at DESC, source_created_at DESC
       LIMIT ?`,
    )
    .all(...words.map((w) => `%${escapeLike(w)}%`), limit);
  return rows.map((r) => ({
    id: r.thread_id,
    title: r.display_title,
    created_at: toIso(r.source_created_at),
    updated_at: toIso(r.source_updated_at),
  }));
}

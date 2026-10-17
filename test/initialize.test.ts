import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "bun:test";
import { join } from "node:path";

test("initialize returns version 0.1.1 from package.json", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: join(import.meta.dir, ".."),
    stderr: "pipe",
  });
  const client = new Client({ name: "gpt-history-mcp-test", version: "0.0.0" });
  try {
    await client.connect(transport);
    expect(client.getServerVersion()).toEqual({ name: "gpt-history-mcp", version: "0.1.1" });
  } finally {
    await client.close();
  }
});

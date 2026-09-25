import { homedir } from "node:os";
import { join } from "node:path";

export const codexHome = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");

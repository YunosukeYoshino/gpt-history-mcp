// ChatGPT and the Codex catalog both store timestamps as Unix seconds.
export const toIso = (seconds: number) => new Date(seconds * 1000).toISOString();

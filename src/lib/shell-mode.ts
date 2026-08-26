/** localStorage key for the AI/Tools shell-mode preference. */
export const SHELL_MODE_STORAGE_KEY = "reogent.shell.mode";

/** sessionStorage key for the last-visited /chat path (mode toggle + Ask AI restore it). */
export const LAST_CHAT_PATH_KEY = "reogent.lastChatPath";

export type ShellMode = "ai" | "tools" | "unity";

/** Parses a stored shell-mode value tolerantly. */
export function parseShellMode(value: string | null): ShellMode {
  if (value === "tools" || value === "unity") return value;
  return "ai";
}

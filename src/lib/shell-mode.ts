/** localStorage key for the AI/Tools shell-mode preference. */
export const SHELL_MODE_STORAGE_KEY = "reogent.shell.mode";

/** sessionStorage key for the last-visited /chat path (mode toggle + Ask AI restore it). */
export const LAST_CHAT_PATH_KEY = "reogent.lastChatPath";

/** sessionStorage key for the last-visited /tools path. */
export const LAST_TOOLS_PATH_KEY = "reogent.lastToolsPath";

/** sessionStorage key for the last-visited /pulse path. */
export const LAST_UNITY_PATH_KEY = "reogent.lastUnityPath";

export type ShellMode = "ai" | "tools" | "unity";

/** Identifies pages that retain the current mode without replacing its destination. */
export function utilityPageForPath(pathname: string): "settings" | "account" | null {
  return pathname === "/settings" ? "settings" : pathname === "/account" ? "account" : null;
}

/** Parses a stored shell-mode value tolerantly. */
export function parseShellMode(value: string | null): ShellMode {
  if (value === "tools" || value === "unity") return value;
  return "ai";
}

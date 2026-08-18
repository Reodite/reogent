/** localStorage key for the AI/Tools shell-mode preference. */
export const SHELL_MODE_STORAGE_KEY = "reogent.shell.mode";

export type ShellMode = "ai" | "tools";

/** Parses a stored shell-mode value tolerantly. Only "tools" is non-default;
 *  absent, invalid, or any other value resolves to "ai". */
export function parseShellMode(value: string | null): ShellMode {
  return value === "tools" ? "tools" : "ai";
}

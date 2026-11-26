export type AuthMode = "oauth" | "password";

/** Selects OAuth unless USE_OAUTH is explicitly set to false. */
export function getAuthMode(): AuthMode {
  return process.env.USE_OAUTH?.trim().toLowerCase() === "false" ? "password" : "oauth";
}

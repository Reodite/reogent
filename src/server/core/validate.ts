import type { ChatRequest } from "./types";

type Result = { ok: true; value: ChatRequest } | { ok: false; error: string };

const err = (error: string): Result => ({ ok: false, error });

const MAX_MESSAGES = 100;
const MAX_CONTENT_LENGTH = 32_000;
const MAX_SESSION_ID_LENGTH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates an already-JSON-parsed chat request body. Enforces size limits. */
export function validateChatRequest(body: unknown): Result {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return err("Request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (!("messages" in b)) return err('Missing "messages" field');
  if (!Array.isArray(b.messages)) return err('"messages" must be an array');
  if (b.messages.length === 0) return err('"messages" must not be empty');
  if (b.messages.length > MAX_MESSAGES) return err(`"messages" exceeds limit of ${MAX_MESSAGES}`);
  for (const m of b.messages) {
    if (typeof m !== "object" || m === null) return err("Each message must be an object");
    const msg = m as Record<string, unknown>;
    if (msg.role !== "user" && msg.role !== "assistant") {
      return err('Each message role must be "user" or "assistant"');
    }
    if (typeof msg.content !== "string") return err("Each message content must be a string");
    if (msg.content.length > MAX_CONTENT_LENGTH)
      return err(`Message content exceeds limit of ${MAX_CONTENT_LENGTH} characters`);
  }
  if (b.session_id !== undefined) {
    if (typeof b.session_id !== "string") return err('"session_id" must be a string');
    if (b.session_id.length > MAX_SESSION_ID_LENGTH) return err('"session_id" is too long');
    if (!UUID_RE.test(b.session_id)) return err('"session_id" must be a valid UUID');
  }
  return { ok: true, value: { session_id: b.session_id as string | undefined, messages: b.messages } };
}

import { recordTokenUsage } from "../account";
import { converse } from "../llm";
import { createCapacityLimit, MAX_TIMER_MS, positiveIntegerEnv } from "../resource-limits";
import { updateSessionTitle } from "../sessions/store";

const TITLE_PROMPT = `Generate a short title (max 60 chars) for this conversation based on the user's question and the assistant's response. Return ONLY the title text, no quotes, no punctuation at the end.`;

const acquireTitle = createCapacityLimit(positiveIntegerEnv("TITLE_MAX_CONCURRENT", 2));
const TITLE_TIMEOUT_MS = positiveIntegerEnv("TITLE_TIMEOUT_MS", 15_000, MAX_TIMER_MS);

/** Starts bounded title generation after the first saved exchange; skips work at capacity. */
export function generateSessionTitle(
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): void {
  const release = acquireTitle();
  if (!release) return;
  const owner = new AbortController();
  const deadline = setTimeout(() => owner.abort(new Error("Title deadline exceeded")), TITLE_TIMEOUT_MS);
  void (async () => {
    try {
      const result = await converse({
        system: TITLE_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                text: `User asked: ${userMessage}\n\nAssistant replied: ${assistantMessage.slice(0, 300)}\n\nGenerate a short title for this conversation.`,
              },
            ],
          },
        ],
        toolSpecs: [],
        signal: owner.signal,
      });
      owner.signal.throwIfAborted();
      await recordTokenUsage(userId, result.totalTokens);
      owner.signal.throwIfAborted();
      const raw = (result.message.content ?? [])
        .map((b) => b.text)
        .filter(Boolean)
        .join("")
        .trim()
        .replace(/^["']|["']$/g, "") // strip wrapping quotes
        .slice(0, 60);
      if (raw) {
        await updateSessionTitle(userId, sessionId, raw);
      }
    } catch (e) {
      if (!owner.signal.aborted) console.error("[title-gen] Failed to generate session title:", e);
    } finally {
      clearTimeout(deadline);
      owner.abort();
      release();
    }
  })();
}

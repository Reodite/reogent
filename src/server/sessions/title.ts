import { converse } from "../llm";
import { updateSessionTitle } from "../sessions/store";

const TITLE_PROMPT = `Generate a short title (max 60 chars) for this conversation based on the user's question and the assistant's response. Return ONLY the title text, no quotes, no punctuation at the end.`;

/** Fire-and-forget: generates a title from the first exchange and updates the DB. */
export function generateSessionTitle(sessionId: string, userMessage: string, assistantMessage: string): void {
  // Run in background — don't await, don't block the response
  void (async () => {
    try {
      const result = await converse({
        system: TITLE_PROMPT,
        messages: [
          { role: "user", content: [{ text: userMessage }] },
          { role: "assistant", content: [{ text: assistantMessage.slice(0, 500) }] },
          { role: "user", content: [{ text: "Generate a title for this conversation." }] },
        ],
        toolSpecs: [],
      });
      const title = (result.message.content ?? [])
        .map((b) => b.text)
        .filter(Boolean)
        .join("")
        .trim()
        .slice(0, 60);
      if (title) {
        await updateSessionTitle(sessionId, title);
      }
    } catch {
      // Title generation is best-effort; silently ignore failures
    }
  })();
}

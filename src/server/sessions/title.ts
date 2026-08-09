import { converse } from "../llm";
import { updateSessionTitle } from "../sessions/store";

const TITLE_PROMPT = `Generate a short title (max 60 chars) for this conversation based on the user's question and the assistant's response. Return ONLY the title text, no quotes, no punctuation at the end.`;

/** Fire-and-forget: generates a title from the first exchange and updates the DB. */
export function generateSessionTitle(sessionId: string, userMessage: string, assistantMessage: string): void {
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
      });
      const raw = (result.message.content ?? [])
        .map((b) => b.text)
        .filter(Boolean)
        .join("")
        .trim()
        .replace(/^["']|["']$/g, "") // strip wrapping quotes
        .slice(0, 60);
      if (raw) {
        await updateSessionTitle(sessionId, raw);
      }
    } catch (e) {
      console.error("[title-gen] Failed to generate session title:", e);
    }
  })();
}

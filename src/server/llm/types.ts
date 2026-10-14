import type { ConverseFn } from "../core/types";

export type ConverseStreamEvent =
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | {
      type: "tool_use";
      toolUseId: string;
      name: string;
      input: Record<string, unknown>;
      /** Gemini thought signature to echo back with this call in history. */
      thoughtSignature?: string;
    }
  | { type: "stop"; reason: string }
  | { type: "usage"; totalTokens: number };

export interface LlmAdapter {
  converse: ConverseFn;
  converseStream(req: Parameters<ConverseFn>[0] & { forceToolUse?: boolean }): AsyncGenerator<ConverseStreamEvent>;
}

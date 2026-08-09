// Streaming agent loop: yields NDJSON events as the model generates text
// and executes tools. The non-streaming loop in loop.ts remains for property tests.

import type { ChatMessage, ContentBlock, ConverseMessage, DatasetModule, SearchClient, ToolCall } from "../core/types";
import { converse, converseStream } from "../llm";
import { executeTool, isToolError } from "./executor";
import { ITERATION_LIMIT, systemPrompt } from "./loop";

// Stream event types sent as NDJSON lines to the client
export type StreamEvent =
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "text_clear" }
  | { type: "tool_start"; name: string; input: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: unknown }
  | { type: "turn_start" }
  | { type: "done"; message: string; tool_calls: ToolCall[]; warning?: string; follow_ups?: string[] }
  | { type: "error"; message: string };

export interface StreamAgentDeps {
  modules: DatasetModule[];
  search: SearchClient;
}

/** Runs the agent loop, yielding StreamEvents via an async generator. */
export async function* streamAgent(messages: ChatMessage[], deps: StreamAgentDeps): AsyncGenerator<StreamEvent> {
  const toolSpecs = deps.modules.flatMap((m) => m.tools.map((t) => t.spec));
  const convo: ConverseMessage[] = messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
  const toolCalls: ToolCall[] = [];
  let fullText = "";

  for (let i = 0; ; i++) {
    if (i > 0) yield { type: "turn_start" as const };

    // After soft limit, nudge model to wrap up but keep tools available
    if (i === ITERATION_LIMIT) {
      convo.push({
        role: "user",
        content: [
          {
            text: "You have used many tool calls. Please provide your final answer now based on the information you have gathered so far. Do not call more tools unless absolutely necessary.",
          },
        ],
      });
    }

    let iterText = "";
    const toolUses: { toolUseId: string; name: string; input: Record<string, unknown> }[] = [];
    let stopReason = "end_turn";
    let sawToolUse = false;

    // Stream thinking immediately. Stream text optimistically as the answer.
    // If a tool_use block appears after text, emit text_clear to retract it
    // and re-emit the text as thinking.
    for await (const event of converseStream({
      messages: convo,
      system: systemPrompt(),
      toolSpecs,
    })) {
      if (event.type === "thinking") {
        yield { type: "thinking", delta: event.delta };
      } else if (event.type === "text") {
        iterText += event.delta;
        if (!sawToolUse) {
          yield { type: "text", delta: event.delta };
        }
      } else if (event.type === "tool_use") {
        if (!sawToolUse && iterText) {
          // Retract streamed text and reclassify as thinking
          yield { type: "text_clear" };
          yield { type: "thinking", delta: iterText };
        }
        sawToolUse = true;
        toolUses.push(event);
      } else if (event.type === "stop") {
        stopReason = event.reason;
      }
    }

    if (iterText && !sawToolUse) fullText = iterText;

    // Build the assistant message for conversation history
    const assistantContent: ContentBlock[] = [];
    if (iterText) assistantContent.push({ text: iterText });
    for (const tu of toolUses) {
      assistantContent.push({ toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: tu.input } });
    }
    convo.push({ role: "assistant", content: assistantContent });

    if (stopReason !== "tool_use") {
      // Generate follow-up suggestions based on the conversation
      let follow_ups: string[] | undefined;
      try {
        const followUpResult = await converse({
          system:
            'Based on this conversation, suggest 2-3 short follow-up questions the user might ask next. Return ONLY a JSON array of strings, nothing else. Example: ["question 1", "question 2"]',
          messages: [
            {
              role: "user",
              content: [
                {
                  text: convo
                    .map((m) =>
                      m.content
                        .map((b) => b.text)
                        .filter(Boolean)
                        .join(""),
                    )
                    .join("\n")
                    .slice(-1000),
                },
              ],
            },
          ],
          toolSpecs: [],
        });
        const raw = (followUpResult.message.content ?? [])
          .map((b) => b.text)
          .filter(Boolean)
          .join("")
          .trim();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          follow_ups = parsed.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 3);
        }
      } catch {
        // Follow-up generation is best-effort
      }
      yield { type: "done", message: fullText, tool_calls: toolCalls, follow_ups };
      return;
    }

    // Execute tools
    const results: ContentBlock[] = [];
    for (const { toolUseId, name, input } of toolUses) {
      yield { type: "tool_start", name, input };
      const result = await executeTool(deps.modules, name, input, deps.search);
      toolCalls.push({ name, input, result });
      yield { type: "tool_end", name, result };
      results.push({
        toolResult: {
          toolUseId,
          content: [{ json: result }],
          ...(isToolError(result) ? { status: "error" as const } : {}),
        },
      });
    }
    convo.push({ role: "user", content: results });
  }
}

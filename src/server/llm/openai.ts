import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ContentBlock, ConverseMessage, ToolSpec } from "../core/types";
import { createThinkTagSplitter, stripThinkTags } from "./think-tags";
import type { ConverseStreamEvent, LlmAdapter } from "./types";

function toOpenAIMessages(messages: ConverseMessage[], system: string): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: "system", content: system }];

  for (const m of messages) {
    if (m.role === "user") {
      for (const block of m.content) {
        if (block.toolResult) {
          out.push({
            role: "tool",
            tool_call_id: block.toolResult.toolUseId,
            content: JSON.stringify(block.toolResult.content.map((c) => c.json)),
          });
        } else if (block.text) {
          out.push({ role: "user", content: block.text });
        }
      }
    } else {
      const textParts = m.content
        .filter((b) => b.text)
        .map((b) => b.text ?? "")
        .join("");
      const toolCalls = m.content
        .filter((b) => b.toolUse)
        .map((b) => ({
          id: b.toolUse!.toolUseId,
          type: "function" as const,
          function: { name: b.toolUse!.name, arguments: JSON.stringify(b.toolUse!.input) },
        }));

      out.push({
        role: "assistant",
        content: textParts || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    }
  }

  return out;
}

function toOpenAITools(specs: ToolSpec[]): ChatCompletionTool[] {
  return specs.map((s) => ({
    type: "function",
    function: {
      name: s.name,
      description: s.description,
      parameters: s.inputSchema.json,
    },
  }));
}

export function createOpenAIAdapter(): LlmAdapter {
  let client: OpenAI | undefined;

  const getClient = () => {
    client ??= new OpenAI({
      baseURL: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
      apiKey: process.env.LLM_API_KEY || "unused",
    });
    return client;
  };

  const getModel = () => process.env.LLM_MODEL || "llama3.1";

  const converse = async ({
    messages,
    system,
    toolSpecs,
  }: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }) => {
    const res = await getClient().chat.completions.create({
      model: getModel(),
      messages: toOpenAIMessages(messages, system),
      tools: toolSpecs.length ? toOpenAITools(toolSpecs) : undefined,
      parallel_tool_calls: toolSpecs.length > 0 ? true : undefined,
    });

    const choice = res.choices[0];
    const content: ContentBlock[] = [];

    if (choice.message.content) {
      const text = stripThinkTags(choice.message.content);
      if (text) content.push({ text });
    }
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* pass */
        }
        content.push({
          toolUse: { toolUseId: tc.id, name: tc.function.name, input },
        });
      }
    }

    const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
    return { stopReason, message: { role: "assistant" as const, content } };
  };

  async function* converseStream(req: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }): AsyncGenerator<ConverseStreamEvent> {
    const stream = await getClient().chat.completions.create({
      model: getModel(),
      messages: toOpenAIMessages(req.messages, req.system),
      tools: req.toolSpecs.length ? toOpenAITools(req.toolSpecs) : undefined,
      parallel_tool_calls: req.toolSpecs.length > 0 ? true : undefined,
      stream: true,
    });

    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    // Reclassifies inline <think>…</think> in content as thinking; buffers
    // partial tags across chunk boundaries so a split tag never leaks.
    const splitter = createThinkTagSplitter();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Reasoning tokens (provider-dependent field)
      const reasoning =
        (delta as Record<string, unknown>).reasoning_content ?? (delta as Record<string, unknown>).reasoning;
      if (typeof reasoning === "string" && reasoning) {
        yield { type: "thinking", delta: reasoning };
      }

      if (delta.content) {
        yield* splitter.push(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          let entry = toolCalls.get(idx);
          if (!entry) {
            entry = { id: tc.id || "", name: tc.function?.name || "", args: "" };
            toolCalls.set(idx, entry);
          }
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        yield* splitter.flush();
        for (const [, tc] of toolCalls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.args || "{}");
          } catch {
            /* pass */
          }
          yield { type: "tool_use", toolUseId: tc.id, name: tc.name, input };
        }
        toolCalls.clear();

        const reason = finishReason === "tool_calls" ? "tool_use" : "end_turn";
        yield { type: "stop", reason };
      }
    }
  }

  return { converse, converseStream };
}

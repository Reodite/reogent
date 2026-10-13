import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, ConverseMessage, ToolSpec } from "../core/types";
import type { ConverseStreamEvent, LlmAdapter } from "./types";

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicContent = Anthropic.ContentBlockParam;
type AnthropicTool = Anthropic.Tool;

function toAnthropicMessages(messages: ConverseMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      const content: AnthropicContent[] = [];
      for (const block of m.content) {
        if (block.toolResult) {
          content.push({
            type: "tool_result",
            tool_use_id: block.toolResult.toolUseId,
            content: JSON.stringify(block.toolResult.content.map((c) => c.json)),
            ...(block.toolResult.status === "error" ? { is_error: true } : {}),
          });
        } else if (block.text) {
          content.push({ type: "text", text: block.text });
        }
      }
      out.push({ role: "user", content });
    } else {
      const content: AnthropicContent[] = [];
      for (const block of m.content) {
        if (block.text) {
          content.push({ type: "text", text: block.text });
        } else if (block.toolUse) {
          content.push({
            type: "tool_use",
            id: block.toolUse.toolUseId,
            name: block.toolUse.name,
            input: block.toolUse.input,
          });
        }
      }
      out.push({ role: "assistant", content });
    }
  }

  return out;
}

function toAnthropicTools(specs: ToolSpec[]): AnthropicTool[] {
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    input_schema: s.inputSchema.json as Anthropic.Tool["input_schema"],
  }));
}

function totalTokens(usage: Anthropic.Usage | undefined): number | undefined {
  if (!usage) return undefined;
  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

export function createAnthropicAdapter(): LlmAdapter {
  let client: Anthropic | undefined;

  const getClient = () => {
    client ??= new Anthropic({
      apiKey: process.env.LLM_API_KEY || "",
      baseURL: process.env.LLM_BASE_URL || undefined,
    });
    return client;
  };

  const getModel = () => process.env.LLM_MODEL || "claude-sonnet-4-20250514";

  const converse = async ({
    messages,
    system,
    toolSpecs,
  }: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }) => {
    const res = await getClient().messages.create({
      model: getModel(),
      max_tokens: 16384,
      system,
      messages: toAnthropicMessages(messages),
      ...(toolSpecs.length ? { tools: toAnthropicTools(toolSpecs) } : {}),
    });

    const content: ContentBlock[] = [];
    for (const block of res.content) {
      if (block.type === "text") {
        content.push({ text: block.text });
      } else if (block.type === "tool_use") {
        content.push({
          toolUse: {
            toolUseId: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          },
        });
      }
    }

    const stopReason = res.stop_reason === "tool_use" ? "tool_use" : "end_turn";
    return { stopReason, message: { role: "assistant" as const, content }, totalTokens: totalTokens(res.usage) };
  };

  async function* converseStream(req: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }): AsyncGenerator<ConverseStreamEvent> {
    const stream = getClient().messages.stream({
      model: getModel(),
      max_tokens: 16384,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      ...(req.toolSpecs.length ? { tools: toAnthropicTools(req.toolSpecs) } : {}),
    });

    let currentToolId = "";
    let currentToolName = "";
    let currentToolInput = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "thinking") {
          // Thinking block start; deltas follow
        } else if (block.type === "tool_use") {
          currentToolId = block.id;
          currentToolName = block.name;
          currentToolInput = "";
        }
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "thinking_delta") {
          yield { type: "thinking", delta: delta.thinking };
        } else if (delta.type === "text_delta") {
          yield { type: "text", delta: delta.text };
        } else if (delta.type === "input_json_delta") {
          currentToolInput += delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolId) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(currentToolInput || "{}");
          } catch {
            /* pass */
          }
          yield { type: "tool_use", toolUseId: currentToolId, name: currentToolName, input };
          currentToolId = "";
          currentToolName = "";
          currentToolInput = "";
        }
      } else if (event.type === "message_stop") {
        const msg = await stream.finalMessage();
        const tokens = totalTokens(msg.usage);
        if (tokens !== undefined) yield { type: "usage", totalTokens: tokens };
        const reason = msg.stop_reason === "tool_use" ? "tool_use" : "end_turn";
        yield { type: "stop", reason };
      }
    }
  }

  return { converse, converseStream };
}

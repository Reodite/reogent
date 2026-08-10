import {
  type GenerativeModel,
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "@google/generative-ai";
import type { ContentBlock, ConverseMessage, ToolSpec } from "../core/types";
import type { ConverseStreamEvent, LlmAdapter } from "./types";

function toGoogleContents(messages: ConverseMessage[]): Content[] {
  const out: Content[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      const parts: Part[] = [];
      for (const block of m.content) {
        if (block.toolResult) {
          parts.push({
            functionResponse: {
              name: block.toolResult.toolUseId,
              response: { result: block.toolResult.content.map((c) => c.json) },
            },
          });
        } else if (block.text) {
          parts.push({ text: block.text });
        }
      }
      out.push({ role: "user", parts });
    } else {
      const parts: Part[] = [];
      for (const block of m.content) {
        if (block.text) {
          parts.push({ text: block.text });
        } else if (block.toolUse) {
          parts.push({
            functionCall: { name: block.toolUse.name, args: block.toolUse.input },
          });
        }
      }
      out.push({ role: "model", parts });
    }
  }

  return out;
}

function toGoogleTools(specs: ToolSpec[]): FunctionDeclaration[] {
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    parameters: s.inputSchema.json as unknown as FunctionDeclaration["parameters"],
  }));
}

export function createGoogleAdapter(): LlmAdapter {
  let model: GenerativeModel | undefined;

  const getModel = () => {
    if (model) return model;
    const apiKey = process.env.LLM_API_KEY || "";
    const modelName = process.env.LLM_MODEL || "gemini-2.0-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: modelName });
    return model;
  };

  const converse = async ({
    messages,
    system,
    toolSpecs,
  }: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }) => {
    const contents = toGoogleContents(messages);
    const tools = toolSpecs.length ? [{ functionDeclarations: toGoogleTools(toolSpecs) }] : undefined;

    const result = await getModel().generateContent({
      contents,
      systemInstruction: { role: "user", parts: [{ text: system }] },
      tools,
    });

    const response = result.response;
    const content: ContentBlock[] = [];
    let hasToolUse = false;

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        content.push({ text: part.text });
      } else if (part.functionCall) {
        hasToolUse = true;
        content.push({
          toolUse: {
            toolUseId: `call_${part.functionCall.name}_${Date.now()}`,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          },
        });
      }
    }

    const stopReason = hasToolUse ? "tool_use" : "end_turn";
    return { stopReason, message: { role: "assistant" as const, content } };
  };

  async function* converseStream(req: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }): AsyncGenerator<ConverseStreamEvent> {
    const contents = toGoogleContents(req.messages);
    const tools = req.toolSpecs.length ? [{ functionDeclarations: toGoogleTools(req.toolSpecs) }] : undefined;

    const result = await getModel().generateContentStream({
      contents,
      systemInstruction: { role: "user", parts: [{ text: req.system }] },
      tools,
    });

    let hasToolUse = false;

    for await (const chunk of result.stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) {
          yield { type: "text", delta: part.text };
        } else if (part.functionCall) {
          hasToolUse = true;
          yield {
            type: "tool_use",
            toolUseId: `call_${part.functionCall.name}_${Date.now()}`,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          };
        }
      }
    }

    yield { type: "stop", reason: hasToolUse ? "tool_use" : "end_turn" };
  }

  return { converse, converseStream };
}

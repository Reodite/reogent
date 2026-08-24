import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
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
              // Gemini matches responses to calls by function name, not by id.
              name: block.toolResult.name ?? block.toolResult.toolUseId,
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
            // gemini-3.x requires the reasoning signature captured at call
            // time to be echoed back whenever history is resent.
            ...(block.toolUse.thoughtSignature ? { thoughtSignature: block.toolUse.thoughtSignature } : {}),
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
    parametersJsonSchema: s.inputSchema.json,
  }));
}

export function createGoogleAdapter(): LlmAdapter {
  // LLM_API_KEY may hold several keys separated by commas — requests rotate
  // through them to spread quota across accounts. The SDK ships with the
  // built-in generativelanguage.googleapis.com endpoint; never set one here.
  const clients = (process.env.LLM_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map(
      (apiKey) =>
        new GoogleGenAI({
          apiKey,
          // Abort requests that never connect — flash models occasionally hang
          // on connect; without this a stalled stream blocks the agent loop.
          httpOptions: { timeout: 20_000 },
        }),
    );
  const modelName = process.env.LLM_MODEL || "gemini-2.0-flash";
  let keyIndex = 0;
  let callCounter = 0;

  const nextClient = (): GoogleGenAI => {
    if (clients.length === 0) throw new Error("LLM_API_KEY is not set");
    return clients.length === 1 ? clients[0] : clients[keyIndex++ % clients.length];
  };

  const isTransientError = (e: unknown): boolean => {
    const msg = e instanceof Error ? e.message : String(e);
    // Quota exhaustion and hung/aborted requests are both worth retrying on
    // the next key; anything else is a real failure.
    return /429|RESOURCE_EXHAUSTED|quota|timeout|aborted|ETIMEDOUT/i.test(msg);
  };

  /** Runs fn, rotating to the next API key on quota/stall errors (one attempt
   *  per key) so one exhausted account or hung connection doesn't fail the
   *  request. */
  async function withKeyRotation<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < Math.max(clients.length, 1); attempt++) {
      try {
        return await fn(nextClient());
      } catch (e) {
        lastError = e;
        if (!isTransientError(e)) throw e;
      }
    }
    throw lastError;
  }

  const uniqueId = (name: string) => `call_${name}_${++callCounter}`;

  const converse = async ({
    messages,
    system,
    toolSpecs,
  }: {
    messages: ConverseMessage[];
    system: string;
    toolSpecs: ToolSpec[];
  }) => {
    const tools = toolSpecs.length ? [{ functionDeclarations: toGoogleTools(toolSpecs) }] : undefined;

    const response = await withKeyRotation((client) =>
      client.models.generateContent({
        model: modelName,
        contents: toGoogleContents(messages),
        config: {
          systemInstruction: system,
          ...(tools ? { tools } : {}),
        },
      }),
    );

    const content: ContentBlock[] = [];
    let hasToolUse = false;

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        content.push({ text: part.text });
      } else if (part.functionCall) {
        hasToolUse = true;
        content.push({
          toolUse: {
            toolUseId: uniqueId(part.functionCall.name),
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
            ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
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
    forceToolUse?: boolean;
  }): AsyncGenerator<ConverseStreamEvent> {
    const tools = req.toolSpecs.length ? [{ functionDeclarations: toGoogleTools(req.toolSpecs) }] : undefined;

    const stream = await withKeyRotation((client) =>
      client.models.generateContentStream({
        model: modelName,
        contents: toGoogleContents(req.messages),
        config: {
          systemInstruction: req.system,
          ...(tools ? { tools } : {}),
          // Force at least one tool call so data questions can't be answered
          // from memory. Mirrors OpenAI's tool_choice: "required".
          ...(req.forceToolUse && tools ? { toolConfig: { functionCallingConfig: { mode: "ANY" as const } } } : {}),
        },
      }),
    );

    let hasToolUse = false;

    // Idle watchdog: flash models occasionally connect then stop sending
    // chunks. Rather than hang the agent loop forever, give up waiting after
    // STREAM_IDLE_MS of silence and finish with whatever arrived.
    const STREAM_IDLE_MS = 15_000;
    const iterator = stream[Symbol.asyncIterator]();
    while (true) {
      const next = (await Promise.race([
        iterator.next(),
        new Promise<{ done: true; value?: never }>((resolve) =>
          setTimeout(() => resolve({ done: true }), STREAM_IDLE_MS),
        ),
      ])) as IteratorResult<GenerateContentResponse>;
      if (next.done) break;
      for (const part of next.value.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) {
          yield { type: "text", delta: part.text };
        } else if (part.functionCall) {
          hasToolUse = true;
          yield {
            type: "tool_use",
            toolUseId: uniqueId(part.functionCall.name),
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
            ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
          };
        }
      }
    }

    yield { type: "stop", reason: hasToolUse ? "tool_use" : "end_turn" };
  }

  return { converse, converseStream };
}

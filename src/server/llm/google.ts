import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import type { ContentBlock, ConverseFn, ConverseMessage, ToolSpec } from "../core/types";
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
    // Retry quota exhaustion and transport timeouts on the next key.
    // withKeyRotation excludes explicit caller cancellation.
    return /429|RESOURCE_EXHAUSTED|quota|timeout|aborted|ETIMEDOUT/i.test(msg);
  };

  /** Retries quota and transport timeout errors once per key, unless the caller cancels. */
  async function withKeyRotation<T>(fn: (client: GoogleGenAI) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < Math.max(clients.length, 1); attempt++) {
      signal?.throwIfAborted();
      try {
        return await fn(nextClient());
      } catch (e) {
        signal?.throwIfAborted();
        lastError = e;
        if (!isTransientError(e)) throw e;
      }
    }
    throw lastError;
  }

  const uniqueId = (name: string) => `call_${name}_${++callCounter}`;

  const converse: ConverseFn = async ({ messages, system, toolSpecs, signal }) => {
    const tools = toolSpecs.length ? [{ functionDeclarations: toGoogleTools(toolSpecs) }] : undefined;

    const response = await withKeyRotation(
      (client) =>
        client.models.generateContent({
          model: modelName,
          contents: toGoogleContents(messages),
          config: {
            systemInstruction: system,
            abortSignal: signal,
            ...(tools ? { tools } : {}),
          },
        }),
      signal,
    );
    signal?.throwIfAborted();

    const content: ContentBlock[] = [];
    let hasToolUse = false;

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        content.push({ text: part.text });
      } else if (part.functionCall?.name) {
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
    return {
      stopReason,
      message: { role: "assistant" as const, content },
      totalTokens: response.usageMetadata?.totalTokenCount,
    };
  };

  async function* converseStream(
    req: Parameters<LlmAdapter["converseStream"]>[0],
  ): AsyncGenerator<ConverseStreamEvent> {
    const tools = req.toolSpecs.length ? [{ functionDeclarations: toGoogleTools(req.toolSpecs) }] : undefined;
    const owned = new AbortController();
    const signal = req.signal ? AbortSignal.any([req.signal, owned.signal]) : owned.signal;
    let iterator: AsyncIterator<GenerateContentResponse> | undefined;

    try {
      const stream = await withKeyRotation(
        (client) =>
          client.models.generateContentStream({
            model: modelName,
            contents: toGoogleContents(req.messages),
            config: {
              systemInstruction: req.system,
              abortSignal: signal,
              ...(tools ? { tools } : {}),
              // Force at least one tool call so data questions can't be answered
              // from memory. Mirrors OpenAI's tool_choice: "required".
              ...(req.forceToolUse && tools
                ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } }
                : {}),
            },
          }),
        signal,
      );
      iterator = stream[Symbol.asyncIterator]();
      let hasToolUse = false;
      let hasFinishReason = false;
      let totalTokens: number | undefined;

      while (true) {
        signal.throwIfAborted();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: (() => void) | undefined;
        let next: IteratorResult<GenerateContentResponse>;
        try {
          next = await Promise.race([
            iterator.next(),
            new Promise<never>((_, reject) => {
              onAbort = () => reject(signal.reason);
              signal.addEventListener("abort", onAbort, { once: true });
              signal.throwIfAborted();
              timer = setTimeout(() => reject(new Error("Google stream idle timeout")), 15_000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          if (onAbort) signal.removeEventListener("abort", onAbort);
        }
        signal.throwIfAborted();
        if (next.done) break;
        totalTokens = next.value.usageMetadata?.totalTokenCount ?? totalTokens;
        const candidate = next.value.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== "FINISH_REASON_UNSPECIFIED") hasFinishReason = true;
        for (const part of candidate?.content?.parts ?? []) {
          signal.throwIfAborted();
          if (part.text) {
            yield { type: "text", delta: part.text };
          } else if (part.functionCall?.name) {
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
        if (hasFinishReason) break;
      }

      signal.throwIfAborted();
      if (!hasFinishReason) throw new Error("Google stream ended before completion");
      if (totalTokens !== undefined) yield { type: "usage", totalTokens };
      signal.throwIfAborted();
      yield { type: "stop", reason: hasToolUse ? "tool_use" : "end_turn" };
    } finally {
      owned.abort();
      // Pending SDK reads can leave return unresolved, so cleanup must not wait for it.
      try {
        void iterator?.return?.().catch(() => {});
      } catch {
        // Ignore cleanup failures to preserve the result or primary error.
      }
    }
  }

  return { converse, converseStream };
}

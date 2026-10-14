import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicAdapter } from "./anthropic";
import { createGoogleAdapter } from "./google";
import { createOpenAIAdapter } from "./openai";

const sdk = vi.hoisted(() => ({
  openai: vi.fn(),
  anthropic: vi.fn(),
  anthropicStream: vi.fn(),
  google: vi.fn(),
  googleStream: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: sdk.openai } };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: sdk.anthropic, stream: sdk.anthropicStream };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.google, generateContentStream: sdk.googleStream };
  },
  FunctionCallingConfigMode: { ANY: "ANY" },
}));

const request = { messages: [], system: "Test", toolSpecs: [] };

async function* chunks(values: unknown[]) {
  yield* values;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("provider token usage", () => {
  it("reads the OpenAI total, including a final usage-only streaming chunk", async () => {
    sdk.openai.mockResolvedValueOnce({
      choices: [{ message: { content: "Hi" }, finish_reason: "stop" }],
      usage: { total_tokens: 150, prompt_tokens: 100, completion_tokens: 50 },
    });
    const adapter = createOpenAIAdapter();
    expect((await adapter.converse(request)).totalTokens).toBe(150);
    sdk.openai.mockResolvedValueOnce(
      chunks([
        { choices: [{ delta: { content: "Hi" }, finish_reason: null }], usage: { total_tokens: 110 } },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
        { choices: [], usage: { total_tokens: 150 } },
      ]),
    );
    const events = await Array.fromAsync(adapter.converseStream(request));
    expect(sdk.openai.mock.calls[1][0].stream_options).toEqual({ include_usage: true });
    expect(events.filter((event) => event.type === "usage")).toEqual([{ type: "usage", totalTokens: 150 }]);
    expect(events).toContainEqual({ type: "text", delta: "Hi" });
  });

  it("includes Anthropic cache reads and writes without counting reasoning twice", async () => {
    const message = {
      content: [{ type: "text", text: "Hi" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 25,
        cache_creation_input_tokens: 75,
        output_tokens_details: { reasoning_tokens: 20 },
      },
    };
    sdk.anthropic.mockResolvedValueOnce(message);
    const adapter = createAnthropicAdapter();
    expect((await adapter.converse(request)).totalTokens).toBe(250);
    sdk.anthropicStream.mockReturnValueOnce(
      Object.assign(chunks([{ type: "message_stop" }]), { finalMessage: async () => message }),
    );
    const events = await Array.fromAsync(adapter.converseStream(request));
    expect(events.filter((event) => event.type === "usage")).toEqual([{ type: "usage", totalTokens: 250 }]);
  });

  it("uses Google's final cumulative total including thoughts and cached input", async () => {
    const response = {
      candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 100,
        cachedContentTokenCount: 25,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 20,
        totalTokenCount: 170,
      },
    };
    sdk.google.mockResolvedValueOnce(response);
    const adapter = createGoogleAdapter();
    expect((await adapter.converse(request)).totalTokens).toBe(170);
    sdk.googleStream.mockResolvedValueOnce(
      chunks([{ usageMetadata: { totalTokenCount: 100 } }, response, { candidates: [] }]),
    );
    const events = await Array.fromAsync(adapter.converseStream(request));
    expect(events.filter((event) => event.type === "usage")).toEqual([{ type: "usage", totalTokens: 170 }]);
  });

  it("does not invent usage when an OpenAI-compatible provider omits it", async () => {
    sdk.openai.mockResolvedValueOnce({ choices: [{ message: { content: "Hi" }, finish_reason: "stop" }] });
    const adapter = createOpenAIAdapter();
    expect((await adapter.converse(request)).totalTokens).toBeUndefined();
    sdk.openai.mockResolvedValueOnce(chunks([{ choices: [{ delta: { content: "Hi" }, finish_reason: "stop" }] }]));
    expect((await Array.fromAsync(adapter.converseStream(request))).some((event) => event.type === "usage")).toBe(
      false,
    );
  });
});

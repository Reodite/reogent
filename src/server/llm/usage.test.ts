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
      candidates: [{ content: { parts: [{ text: "Hi" }] } }],
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
      chunks([{ usageMetadata: { totalTokenCount: 100 } }, response, { candidates: [{ finishReason: "STOP" }] }]),
    );
    const events = await Array.fromAsync(adapter.converseStream(request));
    expect(events.filter((event) => event.type === "usage")).toEqual([{ type: "usage", totalTokens: 170 }]);
  });

  it("rejects Google stream EOF without a finish reason", async () => {
    sdk.googleStream.mockResolvedValueOnce(chunks([{ candidates: [{ content: { parts: [{ text: "partial" }] } }] }]));
    const adapter = createGoogleAdapter();

    await expect(Array.fromAsync(adapter.converseStream(request))).rejects.toThrow(
      "Google model stream ended without a finish reason",
    );
  });

  it("exits promptly when a Google stream stalls and is aborted", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const nextStarted = new Promise<void>((resolve) => (started = resolve));
    const returnIterator = vi.fn(async () => ({ done: true, value: undefined }));
    sdk.googleStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            started();
            return new Promise<IteratorResult<unknown>>(() => {});
          },
          return: returnIterator,
        };
      },
    });
    const stream = createGoogleAdapter().converseStream({ ...request, signal: controller.signal });
    const pending = stream.next();
    await nextStarted;

    controller.abort(new Error("cancelled"));

    await expect(pending).rejects.toThrow("cancelled");
    expect(returnIterator).toHaveBeenCalledOnce();
  });

  it("aborts the Google provider request when the idle timeout expires", async () => {
    let started!: () => void;
    const nextStarted = new Promise<void>((resolve) => (started = resolve));
    const returnIterator = vi.fn(async () => ({ done: true, value: undefined }));
    let providerSignal: AbortSignal | undefined;
    sdk.googleStream.mockImplementationOnce(({ config }: { config: { abortSignal?: AbortSignal } }) => {
      providerSignal = config.abortSignal;
      return Promise.resolve({
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              started();
              return new Promise<IteratorResult<unknown>>(() => {});
            },
            return: returnIterator,
          };
        },
      });
    });
    const stream = createGoogleAdapter().converseStream(request);
    const pending = stream.next();
    const rejection = expect(pending).rejects.toThrow("Google model stream timed out");
    await nextStarted;

    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(providerSignal?.aborted).toBe(true);
    expect(returnIterator).toHaveBeenCalledOnce();
  });

  it("aborts active provider streams and closes their iterators", async () => {
    const controller = new AbortController();
    let resolveNext!: (value: IteratorResult<unknown>) => void;
    let startedOpenAI!: () => void;
    const openaiStarted = new Promise<void>((resolve) => (startedOpenAI = resolve));
    const openaiReturn = vi.fn(async () => ({ done: true, value: undefined }));
    sdk.openai.mockResolvedValueOnce({
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            startedOpenAI();
            return new Promise<IteratorResult<unknown>>((resolve) => (resolveNext = resolve));
          },
          return: openaiReturn,
        };
      },
    });
    const openai = createOpenAIAdapter().converseStream({ ...request, signal: controller.signal });
    const openaiNext = openai.next();
    await openaiStarted;
    controller.abort(new Error("cancelled"));
    resolveNext({ done: false, value: { choices: [{ delta: { content: "late" }, finish_reason: null }] } });
    await expect(openaiNext).rejects.toThrow("cancelled");
    expect(openaiReturn).toHaveBeenCalled();

    const anthropicController = new AbortController();
    const anthropicAbort = vi.fn();
    let resolveAnthropic!: (value: IteratorResult<unknown>) => void;
    let startedAnthropic!: () => void;
    const anthropicStarted = new Promise<void>((resolve) => (startedAnthropic = resolve));
    sdk.anthropicStream.mockReturnValueOnce(
      Object.assign(
        {
          [Symbol.asyncIterator]() {
            return {
              next: () => {
                startedAnthropic();
                return new Promise<IteratorResult<unknown>>((resolve) => (resolveAnthropic = resolve));
              },
            };
          },
        },
        { abort: anthropicAbort, finalMessage: async () => ({ usage: {} }) },
      ),
    );
    const anthropic = createAnthropicAdapter().converseStream({ ...request, signal: anthropicController.signal });
    const anthropicNext = anthropic.next();
    await anthropicStarted;
    anthropicController.abort(new Error("cancelled"));
    resolveAnthropic({ done: true, value: undefined });
    await expect(anthropicNext).rejects.toThrow("cancelled");
    expect(anthropicAbort).toHaveBeenCalledOnce();

    const googleController = new AbortController();
    const googleReturn = vi.fn(async () => ({ done: true, value: undefined }));
    let resolveGoogle!: (value: IteratorResult<unknown>) => void;
    let startedGoogle!: () => void;
    const googleStarted = new Promise<void>((resolve) => (startedGoogle = resolve));
    sdk.googleStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            startedGoogle();
            return new Promise<IteratorResult<unknown>>((resolve) => (resolveGoogle = resolve));
          },
          return: googleReturn,
        };
      },
    });
    const google = createGoogleAdapter().converseStream({ ...request, signal: googleController.signal });
    const googleNext = google.next();
    await googleStarted;
    googleController.abort(new Error("cancelled"));
    resolveGoogle({ done: true, value: undefined });
    await expect(googleNext).rejects.toThrow("cancelled");
    expect(googleReturn).toHaveBeenCalled();
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

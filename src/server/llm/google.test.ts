import type { FinishReason, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConverseFn } from "../core/types";
import { createGoogleAdapter } from "./google";

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn<(req: GenerateContentParameters, key: string) => Promise<GenerateContentResponse>>(),
  generateContentStream:
    vi.fn<(req: GenerateContentParameters, key: string) => Promise<AsyncIterable<GenerateContentResponse>>>(),
}));

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models;
    constructor({ apiKey }: { apiKey: string }) {
      this.models = {
        generateContent: (req: GenerateContentParameters) => sdk.generateContent(req, apiKey),
        generateContentStream: (req: GenerateContentParameters) => sdk.generateContentStream(req, apiKey),
      };
    }
  },
}));

const req: Parameters<ConverseFn>[0] = {
  messages: [{ role: "user", content: [{ text: "hi" }] }],
  system: "test system",
  toolSpecs: [],
};
const text = { candidates: [{ content: { parts: [{ text: "hello" }] } }] } as GenerateContentResponse;
const complete = {
  candidates: [{ finishReason: "STOP" as FinishReason }],
} as GenerateContentResponse;

function mockStream(...responses: GenerateContentResponse[]) {
  const iterator = {
    next: vi.fn<() => Promise<IteratorResult<GenerateContentResponse>>>(),
    return: vi
      .fn<() => Promise<IteratorResult<GenerateContentResponse>>>()
      .mockResolvedValue({ done: true, value: undefined }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  for (const response of responses) iterator.next.mockResolvedValueOnce({ done: false, value: response });
  iterator.next.mockResolvedValue({ done: true, value: undefined });
  sdk.generateContentStream.mockResolvedValue(iterator);
  return iterator;
}

function transportSignal() {
  return sdk.generateContentStream.mock.calls[0][0].config?.abortSignal;
}

beforeEach(() => {
  vi.stubEnv("LLM_API_KEY", "key-one,key-two");
  vi.resetAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Google stream lifetime", () => {
  it("clears each read watchdog and closes a completed stream without changing event order", async () => {
    const iterator = mockStream(text, {
      candidates: [
        {
          content: { parts: [{ functionCall: { name: "lookup", args: { id: 7 } }, thoughtSignature: "signature" }] },
          finishReason: "STOP" as FinishReason,
        },
      ],
    } as GenerateContentResponse);
    const stream = createGoogleAdapter().converseStream(req);
    expect((await stream.next()).value).toEqual({ type: "text", delta: "hello" });
    expect(vi.getTimerCount()).toBe(0);
    expect(transportSignal()?.aborted).toBe(false);
    expect((await stream.next()).value).toEqual({
      type: "tool_use",
      toolUseId: "call_lookup_1",
      name: "lookup",
      input: { id: 7 },
      thoughtSignature: "signature",
    });
    expect(vi.getTimerCount()).toBe(0);
    expect((await stream.next()).value).toEqual({ type: "stop", reason: "tool_use" });
    expect(iterator.next).toHaveBeenCalledTimes(2);
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(vi.getTimerCount()).toBe(0);
    expect(transportSignal()?.aborted).toBe(true);
    expect(iterator.return).toHaveBeenCalledOnce();
  });

  it("rejects an idle read and aborts transport even if iterator return never settles", async () => {
    const iterator = mockStream(text);
    iterator.next.mockImplementation(() => new Promise(() => {}));
    iterator.return.mockImplementation(() => new Promise(() => {}));
    const stream = createGoogleAdapter().converseStream(req);
    await stream.next();
    const outcome = stream.next().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toEqual(new Error("Google stream idle timeout"));
    expect(vi.getTimerCount()).toBe(0);
    expect(transportSignal()?.aborted).toBe(true);
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(sdk.generateContentStream).toHaveBeenCalledOnce();
  });

  it.each(["reject", "throw"])("preserves a read error when cleanup can %s", async (failure) => {
    const iterator = mockStream();
    const primary = new Error("Provider read failed");
    iterator.next.mockRejectedValue(primary);
    iterator.return.mockImplementation(() => {
      if (failure === "throw") throw new Error("Cleanup failed");
      return Promise.reject(new Error("Cleanup failed"));
    });
    await expect(createGoogleAdapter().converseStream(req).next()).rejects.toBe(primary);
    expect(vi.getTimerCount()).toBe(0);
    expect(transportSignal()?.aborted).toBe(true);
    expect(iterator.return).toHaveBeenCalledOnce();
  });

  it("closes an early-returned stream without aborting the caller", async () => {
    const iterator = mockStream(text);
    iterator.return.mockImplementation(() => new Promise(() => {}));
    const caller = new AbortController();
    const stream = createGoogleAdapter().converseStream({ ...req, signal: caller.signal });
    await stream.next();
    await expect(stream.return()).resolves.toEqual({ done: true, value: undefined });
    expect(transportSignal()?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects caller cancellation during an uncooperative read without emitting stop", async () => {
    const iterator = mockStream(text);
    iterator.next.mockImplementation(() => new Promise(() => {}));
    const caller = new AbortController();
    const reason = new Error("Caller cancelled");
    const stream = createGoogleAdapter().converseStream({ ...req, signal: caller.signal });
    await stream.next();
    const outcome = stream.next().catch((error: unknown) => error);
    caller.abort(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(await outcome).toBe(reason);
    expect(transportSignal()?.aborted).toBe(true);
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(sdk.generateContentStream).toHaveBeenCalledOnce();
  });

  it.each([undefined, "FINISH_REASON_UNSPECIFIED"])("rejects EOF with unfinished reason %s", async (finishReason) => {
    const iterator = mockStream({
      candidates: [{ ...text.candidates?.[0], finishReason: finishReason as FinishReason | undefined }],
    } as GenerateContentResponse);
    const stream = createGoogleAdapter().converseStream(req);
    await stream.next();
    await expect(stream.next()).rejects.toThrow(/before completion/i);
    expect(transportSignal()?.aborted).toBe(true);
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it.each(["converse", "converseStream"] as const)(
  "Google %s never rotates keys on explicit caller abort",
  async (method) => {
    const caller = new AbortController();
    const reason = new Error("Caller aborted");
    const adapter = createGoogleAdapter();
    const generate = method === "converse" ? sdk.generateContent : sdk.generateContentStream;
    generate.mockImplementation(async () => {
      caller.abort(reason);
      throw new Error("Request aborted");
    });
    const run = () =>
      method === "converse"
        ? adapter.converse({ ...req, signal: caller.signal })
        : adapter.converseStream({ ...req, signal: caller.signal }).next();
    await expect(run()).rejects.toBe(reason);
    expect(generate).toHaveBeenCalledOnce();
    await expect(run()).rejects.toBe(reason);
    expect(generate).toHaveBeenCalledOnce();
    if (method === "converseStream") expect(transportSignal()?.aborted).toBe(true);
  },
);

it("still retries an ordinary quota error on the next key", async () => {
  mockStream(complete);
  sdk.generateContentStream.mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"));
  await expect(Array.fromAsync(createGoogleAdapter().converseStream(req))).resolves.toEqual([
    { type: "stop", reason: "end_turn" },
  ]);
  expect(sdk.generateContentStream.mock.calls.map(([, key]) => key)).toEqual(["key-one", "key-two"]);
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatApi } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("chat stream cleanup", () => {
  it("clears read watchdogs and releases the reader after completion", async () => {
    vi.useFakeTimers();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "done", message: "ok", tool_calls: [], citations: [] })}\n`,
          ),
        );
        controller.close();
      },
    });
    const response = new Response(source);
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getUserId: async () => "user" });

    await expect(api.chat("session", [{ role: "user", content: "hi" }])).resolves.toMatchObject({ message: "ok" });
    expect(vi.getTimerCount()).toBe(0);
    expect(response.body?.locked).toBe(false);
  });

  it("cancels and releases a stalled reader", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(source);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    const api = createChatApi({ getUserId: async () => "user" });
    const pending = api.chat("session", [{ role: "user", content: "hi" }]);
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

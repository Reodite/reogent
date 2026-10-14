import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let POST: typeof import("./route").POST;

const mocks = vi.hoisted(() => ({
  canWriteSession: vi.fn(),
  appendExchange: vi.fn(),
  generateSessionTitle: vi.fn(),
  streamAgent: vi.fn(),
  getProfile: vi.fn(),
  recordTokenUsage: vi.fn(),
}));
vi.mock("@/src/server/auth", () => ({ requireUser: async () => ({ sub: "u1" }) }));
vi.mock("@/src/server/account", () => ({ recordTokenUsage: mocks.recordTokenUsage }));
vi.mock("@/src/server/rate-limit", () => ({ rateLimitResponse: () => null }));
vi.mock("@/src/server/sessions/store", () => ({
  canWriteSession: mocks.canWriteSession,
  appendExchange: mocks.appendExchange,
}));
vi.mock("@/src/server/sessions/title", () => ({ generateSessionTitle: mocks.generateSessionTitle }));
vi.mock("@/src/server/agent/stream", () => ({ streamAgent: mocks.streamAgent }));
vi.mock("@/src/server/profile", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/src/server/modules", () => ({ modules: [] }));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));

const sessionId = "550e8400-e29b-41d4-a716-446655440000";
const citations = [{ index: 1, label: "CPSC 110", kind: "course", used: true, tool: "search" }];
const request = (id?: string, signal?: AbortSignal) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: id, messages: [{ role: "user", content: "question" }] }),
    signal,
  });

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("CHAT_MAX_CONCURRENT", "1");
  vi.stubEnv("CHAT_TIMEOUT_MS", "1000");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  ({ POST } = await import("./route"));
  mocks.canWriteSession.mockResolvedValue(true);
  mocks.appendExchange.mockResolvedValue(undefined);
  mocks.getProfile.mockResolvedValue(null);
  mocks.streamAgent.mockImplementation(async function* () {
    yield { type: "thinking", delta: "Looking up courses" };
    yield { type: "done", message: "answer", tool_calls: [], citations };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("chat admission and stream ownership", () => {
  it("pulls one event at a time instead of draining an unread response", async () => {
    const frame = (value: unknown) => ({ done: false, value });
    const iterator = {
      next: vi
        .fn()
        .mockResolvedValueOnce(frame({ type: "text", delta: "first" }))
        .mockResolvedValueOnce(frame({ type: "text", delta: "second" }))
        .mockResolvedValueOnce(frame({ type: "done", message: "answer", tool_calls: [], citations }))
        .mockResolvedValue({ done: true }),
      return: vi.fn().mockResolvedValue({ done: true }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    mocks.streamAgent.mockReturnValue(iterator);
    const response = await POST(request());
    const reader = response.body!.getReader();
    try {
      await vi.waitFor(() => expect(iterator.next).toHaveBeenCalledTimes(1));
      expect(mocks.appendExchange).not.toHaveBeenCalled();
      expect((await reader.read()).done).toBe(false);
      await vi.waitFor(() => expect(iterator.next).toHaveBeenCalledTimes(2));
    } finally {
      await reader.cancel();
    }
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(mocks.appendExchange).not.toHaveBeenCalled();
  });

  it("rejects excess work and releases capacity once after repeated cancellation", async () => {
    const first = await POST(request());
    const busy = await POST(request());
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
    expect(busy.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getProfile).toHaveBeenCalledOnce();
    await first.body!.cancel();
    await first.body!.cancel();
    const next = await POST(request());
    expect(next.status).toBe(200);
    expect((await POST(request())).status).toBe(503);
    await next.body!.cancel();
    expect(mocks.appendExchange).not.toHaveBeenCalled();
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
  });

  it.each(["disconnect", "deadline"])("stops a pending agent read on %s without saving it", async (ending) => {
    const requestAbort = new AbortController();
    const gate = Promise.withResolvers<void>();
    mocks.streamAgent.mockImplementation(async function* (_messages: unknown, deps: { signal?: AbortSignal }) {
      const onAbort = () => gate.reject(deps.signal?.reason);
      deps.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await gate.promise;
        yield { type: "done", message: "late", tool_calls: [], citations };
      } finally {
        deps.signal?.removeEventListener("abort", onAbort);
      }
    });
    const response = await POST(request(undefined, requestAbort.signal));
    const output = response.text();
    try {
      await vi.waitFor(() => expect(mocks.streamAgent).toHaveBeenCalledOnce());
      const signal = mocks.streamAgent.mock.calls[0][1].signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      if (ending === "disconnect") requestAbort.abort();
      else await vi.advanceTimersByTimeAsync(1000);
      expect(signal.aborted).toBe(true);
    } finally {
      gate.resolve();
    }
    expect(await output).not.toContain('"type":"done"');
    expect(mocks.appendExchange).not.toHaveBeenCalled();
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.body!.cancel();
  });

  it("expires an unread response without starting persistence", async () => {
    const response = await POST(request());
    await vi.waitFor(() => expect(mocks.streamAgent).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.streamAgent.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(await response.text()).not.toContain('"type":"done"');
    expect(mocks.appendExchange).not.toHaveBeenCalled();
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.body!.cancel();
  });

  it("finishes one accepted save after disconnect and titles only after that save succeeds", async () => {
    const save = Promise.withResolvers<void>();
    mocks.appendExchange.mockReturnValue(save.promise);
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "done", message: "answer", tool_calls: [], citations };
    });
    const abort = new AbortController();
    const response = await POST(request(sessionId, abort.signal));
    const reader = response.body!.getReader();
    const reading = reader.read();
    await vi.waitFor(() => expect(mocks.appendExchange).toHaveBeenCalledOnce());
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
    abort.abort();
    expect((await reading).done).toBe(true);
    const cancelled = reader.cancel();
    save.resolve();
    await cancelled;
    expect(mocks.appendExchange).toHaveBeenCalledOnce();
    expect(mocks.generateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", sessionId, "question", "answer");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains capacity until usage recording settles after cancellation", async () => {
    const accounting = Promise.withResolvers<void>();
    mocks.recordTokenUsage.mockReturnValueOnce(accounting.promise);
    mocks.streamAgent.mockImplementationOnce(async function* () {
      yield { type: "usage", totalTokens: 100 };
      yield { type: "done", message: "answer", tool_calls: [], citations };
    });
    const abort = new AbortController();
    const response = await POST(request(undefined, abort.signal));
    const reader = response.body!.getReader();
    const reading = reader.read();
    await vi.waitFor(() => expect(mocks.recordTokenUsage).toHaveBeenCalledOnce());
    abort.abort();
    expect((await reading).done).toBe(true);
    expect((await POST(request())).status).toBe(503);
    const cancelled = reader.cancel();
    accounting.resolve();
    await cancelled;
    expect(mocks.appendExchange).not.toHaveBeenCalled();
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.body!.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects premature agent EOF and releases the slot without saving a partial answer", async () => {
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "text", delta: "partial" };
    });
    const response = await POST(request());
    expect(await response.text()).toContain('"type":"error"');
    expect(mocks.appendExchange).not.toHaveBeenCalled();
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.body!.cancel();
  });

  it.each(["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992", ""])(
    "rejects invalid chat capacity %j",
    async (value) => {
      vi.stubEnv("CHAT_MAX_CONCURRENT", value);
      vi.resetModules();
      await expect(import("./route")).rejects.toThrow("CHAT_MAX_CONCURRENT");
    },
  );

  it("rejects a deadline beyond the platform timer range", async () => {
    vi.stubEnv("CHAT_TIMEOUT_MS", "2147483648");
    vi.resetModules();
    await expect(import("./route")).rejects.toThrow("CHAT_TIMEOUT_MS");
  });
});

describe("chat session ownership", () => {
  it("rejects a non-owner before model execution or persistence", async () => {
    mocks.canWriteSession.mockResolvedValue(false);

    const response = await POST(request(sessionId));
    await response.text();

    expect(response.status).toBe(404);
    expect(mocks.canWriteSession).toHaveBeenCalledExactlyOnceWith("u1", sessionId);
    expect(mocks.streamAgent).not.toHaveBeenCalled();
    expect(mocks.getProfile).not.toHaveBeenCalled();
    expect(mocks.appendExchange).not.toHaveBeenCalled();
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
  });

  it("accepts a supplied UUID for an owned or new session", async () => {
    const response = await POST(request(sessionId));
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.canWriteSession).toHaveBeenCalledExactlyOnceWith("u1", sessionId);
    expect(mocks.streamAgent).toHaveBeenCalledTimes(1);
    expect(mocks.appendExchange).toHaveBeenCalledExactlyOnceWith(
      "u1",
      sessionId,
      "question",
      "answer",
      [{ type: "thinking", content: "Looking up courses" }],
      citations,
    );
    expect(mocks.generateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", sessionId, "question", "answer");
  });

  it("generates a session ID when the client omits it", async () => {
    const response = await POST(request());
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.canWriteSession).not.toHaveBeenCalled();
    expect(mocks.appendExchange).toHaveBeenCalledTimes(1);
    expect(mocks.appendExchange.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([false, true])("records each turn's usage even if a later turn fails: %s", async (fail) => {
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "usage", totalTokens: 100 };
      yield { type: "usage", totalTokens: 250 };
      if (fail) throw new Error("Provider failed");
      yield { type: "done", message: "answer", tool_calls: [], citations };
    });
    const response = await POST(request());
    const body = await response.text();
    expect(mocks.recordTokenUsage.mock.calls).toEqual([
      ["u1", 100],
      ["u1", 250],
    ]);
    expect(body).not.toContain('"type":"usage"');
    expect(mocks.appendExchange).toHaveBeenCalledTimes(fail ? 0 : 1);
  });

  it("does not expose provider credentials or internal errors", async () => {
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "text", delta: "" };
      throw new Error("Authorization failed: Bearer fixture-private-key at https://provider.invalid?key=fixture-key");
    });
    const response = await POST(request());
    const body = await response.text();
    expect(body).toContain("Could not complete the response. Please try again.");
    expect(body).not.toContain("fixture-private-key");
    expect(body).not.toContain("provider.invalid");
  });

  it("skips title generation when a concurrent owner wins the persistence gate", async () => {
    mocks.appendExchange.mockRejectedValue(new Error("Session not found"));

    const response = await POST(request(sessionId));
    const reader = response.body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(mocks.appendExchange).toHaveBeenCalledOnce());
    const events = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      events.push(JSON.parse(new TextDecoder().decode(next.value)));
    }

    expect(mocks.canWriteSession).toHaveBeenCalledExactlyOnceWith("u1", sessionId);
    expect(mocks.appendExchange).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: "error", message: "Could not complete the response. Please try again." });
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
  });
});

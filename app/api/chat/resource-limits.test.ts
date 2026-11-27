import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamAgent: vi.fn(),
  canWriteSession: vi.fn(),
  consumeDailyChatMessage: vi.fn(),
  appendExchange: vi.fn(),
  getSearch: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({ requireUser: async () => ({ sub: "u1" }) }));
vi.mock("@/src/server/account", () => ({
  DAILY_CHAT_LIMIT: 100,
  consumeDailyChatMessage: mocks.consumeDailyChatMessage,
  recordTokenUsage: vi.fn(),
}));
vi.mock("@/src/server/rate-limit", () => ({ rateLimitResponse: () => null }));
vi.mock("@/src/server/sessions/store", () => ({
  canWriteSession: mocks.canWriteSession,
  appendExchange: mocks.appendExchange,
}));
vi.mock("@/src/server/sessions/title", () => ({ generateSessionTitle: vi.fn() }));
vi.mock("@/src/server/agent/stream", () => ({ streamAgent: mocks.streamAgent }));
vi.mock("@/src/server/profile", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/src/server/modules", () => ({ modules: [] }));
vi.mock("@/src/server/search", () => ({ getSearch: mocks.getSearch }));

const request = () =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
  });

const abortableRequest = (signal: AbortSignal) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    signal,
  });

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("CHAT_MAX_CONCURRENT", "1");
  mocks.canWriteSession.mockResolvedValue(true);
  mocks.consumeDailyChatMessage.mockResolvedValue(true);
  mocks.appendExchange.mockResolvedValue(undefined);
  mocks.getSearch.mockReturnValue({});
  mocks.getProfile.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("chat resource limits", () => {
  it("rejects over-capacity work and releases capacity when a reader cancels", async () => {
    let firstSignal: AbortSignal | undefined;
    mocks.streamAgent
      .mockImplementationOnce(async function* (_messages, deps) {
        firstSignal = deps.signal;
        yield { type: "thinking", delta: "working" };
        await new Promise<void>((resolve) => firstSignal?.addEventListener("abort", resolve, { once: true }));
        firstSignal?.throwIfAborted();
      })
      .mockImplementationOnce(async function* () {
        yield { type: "done", message: "answer", tool_calls: [], citations: [] };
      });
    const { POST } = await import("./route");
    const first = await POST(request());
    const reader = first.body?.getReader();
    await reader?.read();

    const limited = await POST(request());
    expect(limited.status).toBe(503);
    expect(limited.headers.get("retry-after")).toBe("1");

    await reader?.cancel("client left");
    expect(firstSignal?.aborted).toBe(true);
    expect(mocks.appendExchange).not.toHaveBeenCalled();

    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.text();
    expect(mocks.appendExchange).toHaveBeenCalledTimes(1);
  });

  it("aborts timed-out model work and releases its capacity slot", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CHAT_TIMEOUT_MS", "1000");
    let firstSignal: AbortSignal | undefined;
    mocks.streamAgent
      .mockImplementationOnce(async function* (_messages, deps) {
        firstSignal = deps.signal;
        yield { type: "thinking", delta: "partial" };
        await new Promise<void>((resolve) => firstSignal?.addEventListener("abort", resolve, { once: true }));
        firstSignal?.throwIfAborted();
      })
      .mockImplementationOnce(async function* () {
        yield { type: "done", message: "complete", tool_calls: [], citations: [] };
      });
    const { POST } = await import("./route");
    const timed = await POST(request());
    const pending = timed.text();
    await vi.advanceTimersByTimeAsync(1000);
    const body = await pending;

    expect(firstSignal?.aborted).toBe(true);
    expect(body).toContain('"type":"thinking","delta":"partial"');
    expect(body).toContain('"type":"error","message":"Could not complete the response. Please try again."');
    expect(body).not.toContain('"type":"done"');
    expect(mocks.appendExchange).not.toHaveBeenCalled();

    const next = await POST(request());
    await next.text();
    expect(mocks.appendExchange).toHaveBeenCalledTimes(1);
  });

  it("releases capacity when search initialization fails", async () => {
    mocks.getSearch.mockImplementationOnce(() => {
      throw new Error("MEILI_API_KEY is not set");
    });
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "done", message: "recovered", tool_calls: [], citations: [] };
    });
    const { POST } = await import("./route");

    const failed = await POST(request());
    expect(failed.status).toBe(500);

    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.text();
  });

  it("holds capacity while loading the profile and releases it after completion", async () => {
    let resolveProfile!: (profile: null) => void;
    const profileRequest = new Promise<null>((resolve) => {
      resolveProfile = resolve;
    });
    mocks.getProfile.mockReturnValueOnce(profileRequest).mockResolvedValue(null);
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "done", message: "answer", tool_calls: [], citations: [] };
    });
    const { POST } = await import("./route");

    const firstPending = POST(request());
    await vi.waitFor(() => expect(mocks.getProfile).toHaveBeenCalledTimes(1));
    const next = await POST(request());
    expect(next.status).toBe(503);

    resolveProfile(null);
    const first = await firstPending;
    expect(first.status).toBe(200);
    await first.text();
    const retry = await POST(request());
    expect(retry.status).toBe(200);
    await retry.text();
    expect(mocks.appendExchange).toHaveBeenCalledTimes(2);
  });

  it("releases capacity when profile loading exceeds the chat deadline", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CHAT_TIMEOUT_MS", "1000");
    let resolveProfile!: (profile: null) => void;
    const profileRequest = new Promise<null>((resolve) => {
      resolveProfile = resolve;
    });
    mocks.getProfile.mockReturnValue(profileRequest);
    const { POST } = await import("./route");

    const pending = POST(request());
    await vi.waitFor(() => expect(mocks.getProfile).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(1000);
    const failed = await pending;
    expect(failed.status).toBe(504);
    resolveProfile(null);

    mocks.getProfile.mockResolvedValue(null);
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "done", message: "recovered", tool_calls: [], citations: [] };
    });
    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.text();
  });

  it("releases capacity when the client cancels during profile loading", async () => {
    let started!: () => void;
    const profileStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let resolveProfile!: (profile: null) => void;
    mocks.getProfile.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveProfile = resolve;
          started();
        }),
    );
    mocks.streamAgent.mockImplementation(async function* () {
      yield { type: "done", message: "recovered", tool_calls: [], citations: [] };
    });
    const { POST } = await import("./route");
    const controller = new AbortController();
    const pending = POST(abortableRequest(controller.signal));
    await profileStarted;
    controller.abort(new Error("client disconnected"));
    expect((await pending).status).toBe(204);
    resolveProfile(null);

    const next = await POST(request());
    expect(next.status).toBe(200);
    await next.text();
  });
});

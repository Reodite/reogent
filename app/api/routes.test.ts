import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

vi.mock("@/src/server/sessions/store", () => ({
  listSessions: vi.fn(async () => [{ session_id: "s1", title: "t", updatedAt: "2026-08-06T00:00:00Z" }]),
  getSessionMessages: vi.fn(async (_sub: string, id: string) =>
    id === "mine" ? [{ role: "user", content: "q" }] : null,
  ),
  appendExchange: vi.fn(async () => {}),
  getProfile: vi.fn(async () => ({ preferences: {} })),
  putProfile: vi.fn(async () => {}),
}));

const converse = vi.fn();
vi.mock("@/src/server/llm", () => ({
  converse: (...args: unknown[]) => converse(...args),
  converseStream: vi.fn(),
}));

const streamAgent = vi.fn();
vi.mock("@/src/server/agent/stream", () => ({
  streamAgent: (...args: unknown[]) => streamAgent(...args),
}));

vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));

const { POST: chatPost } = await import("./chat/route");
const { GET: sessionsGet } = await import("./sessions/route");
const { GET: sessionGet } = await import("./sessions/[id]/route");
const { GET: geoGet } = await import("./geo/[name]/route");

const req = (init: RequestInit & { auth?: boolean } = {}) =>
  new Request("http://localhost/api/x", {
    ...init,
    headers: {
      ...(init.auth === false ? {} : { authorization: "Bearer token" }),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  converse.mockReset();
  streamAgent.mockReset();
});

describe("auth (7.2)", () => {
  it("missing token → 401", async () => {
    const res = await sessionsGet(req({ auth: false }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTruthy();
  });

  it("invalid or expired token → 401", async () => {
    verify.mockRejectedValue(new Error("expired"));
    const res = await chatPost(req({ method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});

async function readStream(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("POST /api/chat", () => {
  it("400 on non-JSON body", async () => {
    const res = await chatPost(req({ method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it("400 on missing or empty messages", async () => {
    for (const body of [{}, { messages: [] }]) {
      const res = await chatPost(req({ method: "POST", body: JSON.stringify(body) }));
      expect(res.status).toBe(400);
    }
  });

  it("200 with streamed agent result on a valid request", async () => {
    streamAgent.mockImplementation(async function* () {
      yield { type: "text", delta: "hello" };
      yield { type: "done", message: "hello", tool_calls: [] };
    });
    const res = await chatPost(
      req({
        method: "POST",
        body: JSON.stringify({
          session_id: "550e8400-e29b-41d4-a716-446655440000",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const events = await readStream(res);
    expect(events).toContainEqual({ type: "text", delta: "hello" });
    expect(events).toContainEqual({ type: "done", message: "hello", tool_calls: [] });
  });

  it("stream emits error event on unhandled failure (2.9)", async () => {
    streamAgent.mockReturnValue({
      [Symbol.asyncIterator]() {
        return { next: () => Promise.reject(new Error("bedrock down")) };
      },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await chatPost(
      req({ method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }),
    );
    consoleError.mockRestore();
    expect(res.status).toBe(200);
    const events = await readStream(res);
    expect(events).toContainEqual({ type: "error", message: "bedrock down" });
  });
});

describe("sessions (6.4)", () => {
  it("returns session summaries", async () => {
    const res = await sessionsGet(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ session_id: "s1", title: "t", updatedAt: "2026-08-06T00:00:00Z" }]);
  });

  it("non-owned session → 404 without data", async () => {
    const res = await sessionGet(req(), { params: Promise.resolve({ id: "someone-elses" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Session not found" });
  });

  it("owned session → chronological messages", async () => {
    const res = await sessionGet(req(), { params: Promise.resolve({ id: "mine" }) });
    expect(await res.json()).toEqual([{ role: "user", content: "q" }]);
  });
});

describe("GET /api/geo/[name]", () => {
  it("unknown geo name → 404", async () => {
    const res = await geoGet(req(), { params: Promise.resolve({ name: "not-a-layer" }) });
    expect(res.status).toBe(404);
  });
});

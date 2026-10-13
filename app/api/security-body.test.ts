import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  limit: vi.fn(),
  effect: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("@/src/server/auth", () => ({ requireUser: mocks.requireUser, signToken: async () => "token" }));
vi.mock("@/src/server/rate-limit", () => ({
  rateLimitResponse: mocks.limit,
  getRateLimitIdentity: () => "test-client",
}));
vi.mock("@/src/server/sessions/store", () => ({
  getUserByUsername: mocks.effect,
  createUser: mocks.effect,
  renameSession: mocks.effect,
  appendExchange: mocks.effect,
}));
vi.mock("bcryptjs", () => ({ default: { compare: async () => true, hash: async () => "hash" } }));
vi.mock("@/src/server/sessions/title", () => ({ generateSessionTitle: vi.fn() }));
vi.mock("@/src/server/agent/stream", () => ({ streamAgent: mocks.stream }));
vi.mock("@/src/server/modules", () => ({ modules: [] }));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));
vi.mock("@/src/server/profile", () => ({ getProfile: async () => null, saveProfile: mocks.effect }));
vi.mock("@/src/server/plans", () => ({ savePlan: mocks.effect }));
vi.mock("@/src/server/schedules", () => ({ saveSchedule: mocks.effect }));
vi.mock("@/src/server/sharer/store", () => ({ savePerson: mocks.effect, createGroup: mocks.effect }));
vi.mock("@/src/server/pulse/store", () => ({ castVote: mocks.effect }));
vi.mock("@/src/server/building-favorites", () => ({ setBuildingFavorite: mocks.effect }));
vi.mock("@/src/server/modules/buildings", () => ({
  getBuildingsGeoJson: async () => ({ features: [{ properties: { BLDG_CODE: "CHEM" } }] }),
}));

const { POST: chat } = await import("./chat/route");
const { POST: login } = await import("./auth/login/route");
const { POST: register } = await import("./auth/register/route");
const { PUT: favorite } = await import("./building-favorites/route");
const { PUT: plan } = await import("./plan/route");
const { PUT: profile } = await import("./profile/route");
const { PUT: schedule } = await import("./schedule/route");
const { PUT: sharedSchedule } = await import("./sharer/schedule/route");
const { POST: group } = await import("./sharer/groups/route");
const { PATCH } = await import("./sessions/[id]/route");
const { POST: vote } = await import("./pulse/vote/route");

const routes = [
  { name: "chat", run: chat, max: 262_144, body: { messages: [{ role: "user", content: "hi" }] }, status: 200 },
  { name: "login", run: login, max: 4096, body: { username: "student", password: "password" }, status: 401 },
  {
    name: "register",
    run: register,
    max: 4096,
    body: { username: "student", password: "test-passphrase" },
    status: 201,
  },
  { name: "favorite", run: favorite, max: 256, body: { code: "CHEM", saved: true }, status: 200 },
  { name: "plan", run: plan, max: 262_144, body: { years: [] }, status: 204 },
  { name: "profile", run: profile, max: 4096, body: {}, status: 204 },
  { name: "schedule", run: schedule, max: 262_144, body: { entries: [] }, status: 204 },
  {
    name: "shared schedule",
    run: sharedSchedule,
    max: 262_144,
    body: {
      handle: "student",
      avatar: { kind: "initials", initials: "ST", color: "#123456" },
      schedule: { sections: [], importedAt: "2026-01-01" },
    },
    status: 200,
  },
  { name: "group", run: group, max: 4096, body: { name: "Friends" }, status: 201 },
  {
    name: "session",
    run: (request: Request) => PATCH(request, { params: Promise.resolve({ id: "session-1" }) }),
    max: 4096,
    body: { title: "New title" },
    status: 200,
  },
  { name: "vote", run: vote, max: 4096, body: { question_id: 1, agree: true }, status: 200 },
];

function request(text: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}

beforeEach(() => {
  mocks.requireUser.mockReset().mockResolvedValue({ sub: "user-1" });
  mocks.limit.mockReset().mockReturnValue(null);
  mocks.effect.mockReset().mockResolvedValue({});
  mocks.stream.mockReset().mockImplementation(async function* () {
    yield { type: "text", delta: "hello" };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(routes)("$name body boundary", ({ name, run, max, body, status }) => {
  it.each([undefined, "1"])("rejects oversized streams with Content-Length %s", async (length) => {
    const response = await run(
      request(JSON.stringify({ ...body, pad: "x".repeat(max) }), length ? { "content-length": length } : {}),
    );
    expect(response.status).toBe(413);
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes rather than characters", async () => {
    const text = JSON.stringify({ ...body, pad: "é".repeat(Math.floor(max / 2)) });
    expect(text.length).toBeLessThan(max);
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(max);
    expect((await run(request(text))).status).toBe(413);
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("preserves small-body behavior with normalized JSON media types", async () => {
    if (name === "login" || name === "register") mocks.effect.mockResolvedValueOnce(null);
    const response = await run(request(JSON.stringify(body), { "content-type": "Application/JSON; charset=utf-8" }));
    expect(response.status).toBe(status);
    if (name === "chat") expect(await response.text()).toContain('"delta":"hello"');
    else expect(mocks.effect).toHaveBeenCalled();
  });

  it("rejects JSON text hidden in a different media type", async () => {
    expect((await run(request(JSON.stringify(body), { "content-type": "text/plain;application/json" }))).status).toBe(
      415,
    );
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("rejects before EOF and cancels unread body without waiting for source cleanup", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const input = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(max + 1));
        },
        cancel,
      }),
      duplex: "half",
    } as RequestInit);
    expect((await run(input)).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("times out stalled uploads before any storage or agent work", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const input = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({ cancel }),
      duplex: "half",
    } as RequestInit);
    const pending = run(input);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    expect((await run(request("{"))).status).toBe(400);
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("returns 400 on a body transport failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("connection lost"));
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await run(failed)).status).toBe(400);
    expect(mocks.effect).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});

describe("body admission order", () => {
  it.each(routes.filter(({ name }) => name !== "login" && name !== "register"))(
    "$name authenticates before reading",
    async ({ run }) => {
      mocks.requireUser.mockResolvedValue(new Response(null, { status: 401 }));
      const input = request("{");
      expect((await run(input)).status).toBe(401);
      expect(input.bodyUsed).toBe(false);
      expect(mocks.limit).not.toHaveBeenCalled();
    },
  );

  it.each([chat, vote, login, register])("checks the rate limit before reading", async (run) => {
    mocks.limit.mockReturnValue(new Response(null, { status: 429 }));
    const input = request("{");
    expect((await run(input)).status).toBe(429);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.effect).not.toHaveBeenCalled();
  });

  it.each([login, register])("checks auth route rate limits before media type", async (run) => {
    mocks.limit.mockReturnValue(new Response(null, { status: 429 }));
    expect((await run(request("{}", { "content-type": "text/plain" }))).status).toBe(429);
  });

  it.each([chat, vote, routes[9].run])("checks media type before authentication", async (run) => {
    expect((await run(request("{}", { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
});

it("returns 400 for a null session PATCH without renaming", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await PATCH(request("null"), { params: Promise.resolve({ id: "session-1" }) })).status).toBe(400);
  expect(mocks.effect).not.toHaveBeenCalled();
});

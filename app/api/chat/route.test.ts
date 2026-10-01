import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  canWriteSession: vi.fn(),
  appendExchange: vi.fn(),
  generateSessionTitle: vi.fn(),
  streamAgent: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock("@/src/server/auth", () => ({ requireUser: async () => ({ sub: "u1" }) }));
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
const request = (id?: string) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: id, messages: [{ role: "user", content: "question" }] }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.canWriteSession.mockResolvedValue(true);
  mocks.appendExchange.mockResolvedValue(undefined);
  mocks.getProfile.mockResolvedValue(null);
  mocks.streamAgent.mockImplementation(async function* () {
    yield { type: "thinking", delta: "Looking up courses" };
    yield { type: "done", message: "answer", tool_calls: [], citations };
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
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(mocks.canWriteSession).toHaveBeenCalledExactlyOnceWith("u1", sessionId);
    expect(mocks.appendExchange).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: "error", message: "Could not complete the response. Please try again." });
    expect(mocks.generateSessionTitle).not.toHaveBeenCalled();
  });
});

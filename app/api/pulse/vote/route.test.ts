import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

const castVote = vi.fn();
vi.mock("@/src/server/pulse/store", () => ({ castVote: (...args: unknown[]) => castVote(...args) }));

// The limiter's buckets are module-global; bypass so unrelated tests can't trip it.
vi.mock("@/src/server/rate-limit", () => ({ rateLimitResponse: () => null }));

const { POST } = await import("./route");

const req = (body: unknown, opts: { auth?: boolean; contentType?: string } = {}) =>
  new Request("http://localhost/api/pulse/vote", {
    method: "POST",
    headers: {
      ...(opts.auth === false ? {} : { authorization: "Bearer token" }),
      "content-type": opts.contentType ?? "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  castVote.mockReset();
});

describe("POST /api/pulse/vote", () => {
  it("415 without a JSON content-type", async () => {
    const res = await POST(req({ question_id: 1, agree: true }, { contentType: "text/plain" }));
    expect(res.status).toBe(415);
  });

  it("401 without a bearer token", async () => {
    const res = await POST(req({ question_id: 1, agree: true }, { auth: false }));
    expect(res.status).toBe(401);
  });

  it("400 on malformed JSON and on a bad body shape", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    expect((await POST(req({ question_id: "1", agree: true }))).status).toBe(400);
    expect((await POST(req({ question_id: 1.5, agree: true }))).status).toBe(400);
    expect((await POST(req({ question_id: 1, agree: "yes" }))).status).toBe(400);
    expect((await POST(req({ question_id: 1 }))).status).toBe(400);
    expect(castVote).not.toHaveBeenCalled();
  });

  it("409 when the store rejects the vote (locked round or unknown question)", async () => {
    castVote.mockResolvedValue(null);
    const res = await POST(req({ question_id: 10, agree: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/closed/i);
  });

  it("200 echoes the stored vote and tallies", async () => {
    castVote.mockResolvedValue({ agree: false, agreeCount: 6, disagreeCount: 5 });
    const res = await POST(req({ question_id: 10, agree: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ question_id: 10, agree: false, agree_count: 6, disagree_count: 5 });
    expect(castVote).toHaveBeenCalledWith("u1", 10, true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

const getActiveFeed = vi.fn();
vi.mock("@/src/server/pulse/store", () => ({ getActiveFeed: (...args: unknown[]) => getActiveFeed(...args) }));

const { GET } = await import("./route");

const req = (auth = true) =>
  new Request("http://localhost/api/pulse", { headers: auth ? { authorization: "Bearer token" } : {} });

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  getActiveFeed.mockReset();
});

describe("GET /api/pulse", () => {
  it("401 without a bearer token", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
  });

  it("passes through a null round when nothing is active", async () => {
    getActiveFeed.mockResolvedValue({ round: null, questions: [] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ round: null, questions: [] });
    expect(getActiveFeed).toHaveBeenCalledWith("u1");
  });

  it("includes tallies for voted questions and strips them for unvoted ones", async () => {
    getActiveFeed.mockResolvedValue({
      round: { id: 3, title: "Week 1", publishedAt: "2026-08-25T00:00:00.000Z" },
      questions: [
        { id: 10, text: "Q1", myAgree: true, agreeCount: 6, disagreeCount: 4 },
        { id: 11, text: "Q2", myAgree: null, agreeCount: 9, disagreeCount: 1 },
      ],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      round: { id: 3, title: "Week 1", published_at: "2026-08-25T00:00:00.000Z" },
      questions: [
        { id: 10, text: "Q1", my_agree: true, agree_count: 6, disagree_count: 4 },
        { id: 11, text: "Q2" },
      ],
    });
  });
});

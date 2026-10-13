import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), getAccount: vi.fn() }));
vi.mock("jose", () => ({ jwtVerify: mocks.verify, SignJWT: vi.fn() }));
vi.mock("@/src/server/account", () => ({ getAccount: mocks.getAccount }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JWT_SECRET", "test-secret");
  vi.stubEnv("AUTH_ENABLED", "true");
  mocks.verify.mockResolvedValue({ payload: { sub: "u1", username: "ada" } });
});
afterEach(() => vi.unstubAllEnvs());

const request = (token?: string) =>
  new Request("http://localhost/api/account?userId=u2", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("GET /api/account", () => {
  it("requires authentication before reading account data", async () => {
    expect((await GET(request())).status).toBe(401);
    mocks.verify.mockRejectedValue(new Error("Invalid JWT"));
    expect((await GET(request("guest"))).status).toBe(401);
    expect(mocks.getAccount).not.toHaveBeenCalled();
  });

  it("returns only the token owner's details with private cache protection", async () => {
    const details = {
      username: "ada",
      createdAt: "2025-09-01T12:00:00.000Z",
      profile: { preferred_name: "Ada" },
      tokensSpent: 250,
      tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
      pulseQuestionsAnswered: 12,
    };
    mocks.getAccount.mockResolvedValue(details);
    const response = await GET(request("valid"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(details);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getAccount).toHaveBeenCalledExactlyOnceWith("u1");
  });

  it("returns 404 for an account that no longer exists", async () => {
    mocks.getAccount.mockResolvedValue(null);
    expect((await GET(request("valid"))).status).toBe(404);
  });

  it("does not expose database errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getAccount.mockRejectedValue(new Error("private database connection"));
    const response = await GET(request("valid"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database");
    log.mockRestore();
  });
});

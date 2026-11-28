import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "oauth",
  createPasswordUser: vi.fn(),
  getPasswordUser: vi.fn(),
  hash: vi.fn(),
  compare: vi.fn(),
  rateLimit: vi.fn(),
  finishOAuth: vi.fn(),
  getOAuthProvider: vi.fn(),
}));

vi.mock("@/src/server/auth-mode", () => ({ getAuthMode: () => mocks.mode }));
vi.mock("@/src/server/sessions/store", () => ({
  createPasswordUser: mocks.createPasswordUser,
  getPasswordUser: mocks.getPasswordUser,
  findOrCreateOAuthUser: vi.fn(),
}));
vi.mock("@/src/server/rate-limit", () => ({
  getRateLimitIdentity: () => "test-client",
  rateLimitResponse: mocks.rateLimit,
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash, compare: mocks.compare } }));
vi.mock("@/src/server/oauth/providers", () => ({
  getOAuthProvider: mocks.getOAuthProvider,
}));
vi.mock("@/src/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/auth")>()),
  sessionCookie: async () => "reodite_session=fixture; Path=/; HttpOnly",
}));

const { POST: login } = await import("./login/route");
const { POST: register } = await import("./register/route");
const { GET: oauthStart } = await import("./[provider]/route");
const { GET: oauthCallback } = await import("./[provider]/callback/route");

const credentialRequest = (body: unknown) =>
  new Request("https://reodite.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.mode = "oauth";
  mocks.createPasswordUser.mockReset().mockResolvedValue("password-user");
  mocks.getPasswordUser.mockReset().mockResolvedValue({ id: "password-user", passwordHash: "hash" });
  mocks.hash.mockReset().mockResolvedValue("hash");
  mocks.compare.mockReset().mockResolvedValue(true);
  mocks.rateLimit.mockReset().mockReturnValue(null);
  mocks.finishOAuth.mockReset();
  mocks.getOAuthProvider.mockReset().mockReturnValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("USE_OAUTH route gating", () => {
  it("rejects credential endpoints before reading bodies in OAuth mode", async () => {
    const request = credentialRequest({ username: "student", password: "secret" });

    expect((await login(request)).status).toBe(404);
    expect((await register(credentialRequest({ username: "student", password: "a-long-password" }))).status).toBe(404);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.getPasswordUser).not.toHaveBeenCalled();
    expect(mocks.createPasswordUser).not.toHaveBeenCalled();
  });

  it("refuses OAuth initiation and callbacks in password mode", async () => {
    mocks.mode = "password";
    const context = { params: Promise.resolve({ provider: "google" }) };

    const start = await oauthStart(new Request("https://reodite.test/api/auth/google"), context);
    const callback = await oauthCallback(
      new Request("https://reodite.test/api/auth/google/callback?code=secret&state=state"),
      context,
    );

    expect(start.headers.get("location")).toBe("/login?error=oauth_unavailable");
    expect(callback.headers.get("location")).toBe("/login?error=oauth_unavailable");
    expect(mocks.getOAuthProvider).not.toHaveBeenCalled();
  });

  it("hashes registration passwords and starts a session in password mode", async () => {
    mocks.mode = "password";
    const response = await register(credentialRequest({ username: "student", password: "correct horse battery" }));

    expect(response.status).toBe(201);
    expect(mocks.hash).toHaveBeenCalledWith("correct horse battery", 10);
    expect(mocks.createPasswordUser).toHaveBeenCalledWith("student", "hash");
    expect(response.headers.get("set-cookie")).toContain("reodite_session=fixture");
  });

  it("maps Mongo duplicate username errors to a conflict response", async () => {
    mocks.mode = "password";
    mocks.createPasswordUser.mockRejectedValueOnce({ code: 11000 });
    const response = await register(credentialRequest({ username: "student", password: "correct horse battery" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Username already taken" });
  });

  it("authenticates passwords without accepting OAuth-only users", async () => {
    mocks.mode = "password";
    mocks.getPasswordUser.mockResolvedValueOnce({ id: "oauth-user", passwordHash: null });
    const response = await login(credentialRequest({ username: "student", password: "provided-password" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid credentials" });
    expect(mocks.compare).not.toHaveBeenCalled();
  });
});

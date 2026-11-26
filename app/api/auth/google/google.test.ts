import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "./callback/route";
import { GET as start } from "./route";

const mocks = vi.hoisted(() => ({ finish: vi.fn(), findOrCreate: vi.fn() }));
vi.mock("@/src/server/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/google")>()),
  finishGoogleSignIn: mocks.finish,
}));
vi.mock("@/src/server/sessions/store", () => ({ findOrCreateGoogleUser: mocks.findOrCreate }));

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("APP_URL", "https://reodite.test");
  vi.stubEnv("JWT_SECRET", "fixture-signing-secret-with-more-than-32-bytes");
  mocks.finish.mockReset().mockResolvedValue({ sub: "google-123", email: "max@example.com", name: "Max Student" });
  mocks.findOrCreate.mockReset().mockResolvedValue({ id: "user-1", username: "max-1234" });
});
afterEach(() => vi.unstubAllEnvs());

const cookies = (response: Response) => response.headers.getSetCookie();

async function begin(redirect = "/app/settings") {
  const response = start(new Request(`https://reodite.test/api/auth/google?redirect=${encodeURIComponent(redirect)}`));
  const cookie = cookies(response)[0].split(";")[0];
  const state = new URL(response.headers.get("location")!).searchParams.get("state")!;
  return { response, cookie, state };
}

const finish = (query: string, cookie?: string) =>
  callback(
    new Request(`https://reodite.test/api/auth/google/callback?${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );

describe("GET /api/auth/google", () => {
  it("sends the browser to Google with single-use state in an httpOnly cookie", async () => {
    const { response, cookie } = await begin();
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location")!).host).toBe("accounts.google.com");
    expect(cookie).toMatch(/^reodite_oauth=/);
    expect(cookies(response)[0]).toContain("Path=/api/auth/google; Max-Age=600; HttpOnly; SameSite=Lax");
  });

  it("returns to the login page when Google is not configured", () => {
    vi.stubEnv("APP_URL", "");
    const response = start(new Request("https://reodite.test/api/auth/google"));
    expect(response.headers.get("location")).toBe("/login?error=google_unavailable");
  });
});

describe("GET /api/auth/google/callback", () => {
  it("starts a session and returns to the requested page", async () => {
    const { cookie, state } = await begin("/app/settings");
    const response = await finish(`code=auth-code&state=${state}`, cookie);
    expect(response.headers.get("location")).toBe("/app/settings");
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-id" }),
      "auth-code",
      expect.any(String),
    );
    expect(mocks.findOrCreate).toHaveBeenCalledWith("google-123", { email: "max@example.com", name: "Max Student" });
    const set = cookies(response);
    expect(set.some((c) => c.startsWith("reodite_oauth=;") && c.includes("Max-Age=0"))).toBe(true);
    expect(set.some((c) => /^reodite_session=[\w-]+\.[\w-]+\.[\w-]+; .*HttpOnly/.test(c))).toBe(true);
  });

  it.each([
    ["a missing sign-in cookie", (state: string) => `code=c&state=${state}`, false],
    ["a state from another browser", () => "code=c&state=forged", true],
    ["a missing code", (state: string) => `state=${state}`, true],
  ])("rejects %s before contacting Google", async (_name, query, withCookie) => {
    const { cookie, state } = await begin();
    const response = await finish(query(state), withCookie ? cookie : undefined);
    expect(response.headers.get("location")).toBe("/login?error=google_failed");
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(cookies(response).some((c) => c.startsWith("reodite_session="))).toBe(false);
  });

  it("reports a cancelled consent", async () => {
    const { cookie, state } = await begin();
    const response = await finish(`error=access_denied&state=${state}`, cookie);
    expect(response.headers.get("location")).toBe("/login?error=google_cancelled");
  });

  it("hides verification failures behind a generic error", async () => {
    mocks.finish.mockRejectedValue(new Error("Google token exchange returned 400"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cookie, state } = await begin();
    const response = await finish(`code=c&state=${state}`, cookie);
    expect(response.headers.get("location")).toBe("/login?error=google_failed");
    log.mockRestore();
  });

  it("never redirects off-site, even with a tampered destination", async () => {
    const { cookie, state } = await begin("https://evil.test/");
    const response = await finish(`code=c&state=${state}`, cookie);
    expect(response.headers.get("location")).toBe("/app");
  });
});

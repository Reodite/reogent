import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "./callback/route";
import { GET as start } from "./route";

const mocks = vi.hoisted(() => ({
  provider: { getConfig: vi.fn(), start: vi.fn(), finish: vi.fn() },
  findOrCreate: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("@/src/server/oauth/providers", () => ({ getOAuthProvider: mocks.getProvider }));
vi.mock("@/src/server/sessions/store", () => ({ findOrCreateOAuthUser: mocks.findOrCreate }));
vi.mock("@/src/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/auth")>()),
  sessionCookie: async () => "reodite_session=fixture-token; Path=/; HttpOnly",
}));

const provider = { id: "fixture", ...mocks.provider };
const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "https://app.test/callback" };

beforeEach(() => {
  mocks.provider.getConfig.mockReset().mockReturnValue(config);
  mocks.provider.start.mockReset().mockReturnValue({
    url: "https://identity.example/authorize?state=fixture-state",
    state: "fixture-state",
    verifier: "fixture-verifier",
  });
  mocks.provider.finish.mockReset().mockResolvedValue({
    subject: "subject-1",
    email: "student@example.com",
    emailVerified: true,
    displayName: "Student Name",
  });
  mocks.findOrCreate.mockReset().mockResolvedValue({ id: "user-1", username: "student-1234" });
  mocks.getProvider.mockImplementation((id: string) => (id === "fixture" ? provider : undefined));
});
afterEach(() => vi.unstubAllEnvs());

const cookies = (response: Response) => response.headers.getSetCookie();

async function begin(redirect = "/app/settings") {
  const response = await start(
    new Request(`https://reodite.test/api/auth/fixture?redirect=${encodeURIComponent(redirect)}`),
    { params: Promise.resolve({ provider: "fixture" }) },
  );
  const cookie = cookies(response)[0].split(";")[0];
  return { response, cookie };
}

const finish = (query: string, cookie?: string, providerId = "fixture") =>
  callback(
    new Request(`https://reodite.test/api/auth/${providerId}/callback?${query}`, {
      headers: cookie ? { cookie } : {},
    }),
    { params: Promise.resolve({ provider: providerId }) },
  );

describe("GET /api/auth/:provider", () => {
  it("starts an adapter flow with a scoped single-use cookie", async () => {
    const { response, cookie } = await begin();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://identity.example/authorize?state=fixture-state");
    expect(cookie).toMatch(/^reodite_oauth=/);
    expect(cookies(response)[0]).toContain("Path=/api/auth/fixture; Max-Age=600; HttpOnly; SameSite=Lax");
    expect(mocks.provider.start).toHaveBeenCalledWith(config);
  });

  it("supports public PKCE providers without a client secret", async () => {
    mocks.provider.getConfig.mockReturnValue({ clientId: "public-client", redirectUri: "https://app.test/callback" });
    const { response } = await begin();

    expect(response.status).toBe(302);
    expect(mocks.provider.start).toHaveBeenCalledWith({
      clientId: "public-client",
      redirectUri: "https://app.test/callback",
    });
  });

  it("rejects providers that are not registered", async () => {
    const response = await start(new Request("https://reodite.test/api/auth/unknown"), {
      params: Promise.resolve({ provider: "unknown" }),
    });
    expect(response.headers.get("location")).toBe("/login?error=oauth_unavailable");
  });
});

describe("GET /api/auth/:provider/callback", () => {
  it("rejects unknown providers without reflecting the route value into cookie headers", async () => {
    const response = await finish("code=code", undefined, "unknown; Secure");

    expect(response.headers.get("location")).toBe("/login?error=oauth_unavailable");
    expect(cookies(response)[0]).toContain("Path=/api/auth;");
    expect(cookies(response)[0]).not.toContain("unknown");
    expect(mocks.provider.finish).not.toHaveBeenCalled();
  });

  it("persists normalized identity and starts an app session", async () => {
    const { cookie } = await begin();
    const state = "fixture-state";
    const response = await finish(`code=auth-code&state=${state}`, cookie);

    expect(response.headers.get("location")).toBe("/app/settings");
    expect(mocks.provider.finish).toHaveBeenCalledWith(config, "auth-code", "fixture-verifier");
    expect(mocks.findOrCreate).toHaveBeenCalledWith("fixture", "subject-1", {
      subject: "subject-1",
      email: "student@example.com",
      emailVerified: true,
      displayName: "Student Name",
    });
    expect(cookies(response)).toContainEqual(
      expect.stringContaining("reodite_oauth=; Path=/api/auth/fixture; Max-Age=0"),
    );
    expect(cookies(response)).toContainEqual(expect.stringContaining("reodite_session=fixture-token"));
  });

  it.each([
    ["missing state cookie", "code=code&state=fixture-state", undefined],
    ["mismatched state", "code=code&state=wrong", "reodite_oauth=fixture-state.fixture-verifier.L2FwcA"],
    ["missing code", "state=fixture-state", "reodite_oauth=fixture-state.fixture-verifier.L2FwcA"],
  ])("rejects %s before provider exchange", async (_label, query, cookie) => {
    const response = await finish(query, cookie);
    expect(response.headers.get("location")).toBe("/login?error=oauth_failed");
    expect(mocks.provider.finish).not.toHaveBeenCalled();
    expect(cookies(response).some((value) => value.startsWith("reodite_session="))).toBe(false);
  });

  it("reports cancelled authorization", async () => {
    const { cookie } = await begin();
    const response = await finish("error=access_denied", cookie);
    expect(response.headers.get("location")).toBe("/login?error=oauth_cancelled");
  });

  it("hides adapter errors and rejects external redirect destinations", async () => {
    mocks.provider.finish.mockRejectedValueOnce(new Error("provider details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cookie } = await begin("https://evil.test/");
    const failed = await finish("code=code&state=fixture-state", cookie);
    expect(failed.headers.get("location")).toBe("/login?error=oauth_failed");
    log.mockRestore();

    const { cookie: secondCookie } = await begin("https://evil.test/");
    const response = await finish("code=code&state=fixture-state", secondCookie);
    expect(response.headers.get("location")).toBe("/app");
  });
});

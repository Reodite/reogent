import { createHash } from "node:crypto";
import * as jose from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { finishGoogleSignIn, googleConfig, startGoogleSignIn } from "./google";

const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "https://app.test/cb" };
let privateKey: CryptoKey;
let jwk: jose.JWK;
let tokenStatus: number;
let idToken: string;
const tokenBodies: URLSearchParams[] = [];

const sign = (claims: jose.JWTPayload) =>
  new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

beforeAll(async () => {
  const pair = await jose.generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await jose.exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
});

beforeEach(() => {
  tokenStatus = 200;
  tokenBodies.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
      if (url === "https://oauth2.googleapis.com/token") {
        tokenBodies.push(new URLSearchParams(String(init?.body)));
        return Response.json({ id_token: idToken }, { status: tokenStatus });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("googleConfig", () => {
  it("stays off until the client id, secret and public URL are all set", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("APP_URL", "");
    expect(googleConfig()).toBeNull();
    vi.stubEnv("APP_URL", "https://reodite.test/ignored-path");
    expect(googleConfig()?.redirectUri).toBe("https://reodite.test/api/auth/google/callback");
  });
});

describe("startGoogleSignIn", () => {
  it("asks only for identity and binds the code to a PKCE verifier", () => {
    const first = startGoogleSignIn(config);
    const second = startGoogleSignIn(config);
    const params = new URL(first.url).searchParams;
    expect(new URL(first.url).origin).toBe("https://accounts.google.com");
    expect(params.get("scope")).toBe("openid profile");
    expect(params.get("state")).toBe(first.state);
    expect(params.get("redirect_uri")).toBe(config.redirectUri);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe(createHash("sha256").update(first.verifier).digest("base64url"));
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(second.verifier);
  });
});

describe("finishGoogleSignIn", () => {
  const claims = { iss: "https://accounts.google.com", aud: "client-id", sub: "google-123", given_name: "Max" };

  it("returns the verified subject and sends the PKCE verifier", async () => {
    idToken = await sign(claims);
    expect(await finishGoogleSignIn(config, "auth-code", "verifier")).toEqual({ sub: "google-123", givenName: "Max" });
    expect(tokenBodies[0].get("code_verifier")).toBe("verifier");
    expect(tokenBodies[0].get("client_secret")).toBe("client-secret");
  });

  it.each([
    ["another app's token", { ...claims, aud: "other-client" }],
    ["a foreign issuer", { ...claims, iss: "https://evil.test" }],
  ])("rejects %s", async (_name, bad) => {
    idToken = await sign(bad);
    await expect(finishGoogleSignIn(config, "auth-code", "verifier")).rejects.toThrow();
  });

  it("rejects a token signed with another key", async () => {
    const { privateKey: other } = await jose.generateKeyPair("RS256");
    idToken = await new jose.SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other);
    await expect(finishGoogleSignIn(config, "auth-code", "verifier")).rejects.toThrow();
  });

  it("fails when Google rejects the code", async () => {
    tokenStatus = 400;
    await expect(finishGoogleSignIn(config, "bad-code", "verifier")).rejects.toThrow("400");
  });
});

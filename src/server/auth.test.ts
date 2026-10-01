import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser, signToken } from "./auth";

const secret = "fixture-signing-secret-with-more-than-32-bytes";
const key = new TextEncoder().encode(secret);
const req = (token: string) => new Request("http://localhost", { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("JWT admission", () => {
  it("accepts issued tokens and keeps the development bypass disabled in production", async () => {
    expect(await requireUser(req(await signToken("user-1", "alice")))).toEqual({ sub: "user-1", username: "alice" });
    expect(((await requireUser(new Request("http://localhost"))) as Response).status).toBe(401);
  });

  it.each(["HS384", "HS512"])("rejects the nonissued algorithm %s", async (alg) => {
    const token = await new SignJWT({ username: "alice" })
      .setProtectedHeader({ alg })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key);
    expect(((await requireUser(req(token))) as Response).status).toBe(401);
  });

  it("requires expiration and issued-at claims", async () => {
    for (const includeExpiry of [true, false]) {
      let jwt = new SignJWT({ username: "alice" }).setProtectedHeader({ alg: "HS256" }).setSubject("user-1");
      jwt = includeExpiry ? jwt.setExpirationTime("7d") : jwt.setIssuedAt();
      expect(((await requireUser(req(await jwt.sign(key)))) as Response).status).toBe(401);
    }
  });

  it("rejects invalid identity shapes", async () => {
    const token = await new SignJWT({ username: { role: "admin" } })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key);
    expect(((await requireUser(req(token))) as Response).status).toBe(401);
  });

  it("rejects expired and tampered tokens", async () => {
    const expired = await new SignJWT({ username: "alice" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("-1s")
      .sign(key);
    expect(((await requireUser(req(expired))) as Response).status).toBe(401);
    expect(((await requireUser(req(`${await signToken("user-1", "alice")}x`))) as Response).status).toBe(401);
  });

  it("refuses weak production signing secrets", async () => {
    vi.stubEnv("JWT_SECRET", "change-me-in-production");
    await expect(signToken("user-1", "alice")).rejects.toThrow(/32/);
  });
});

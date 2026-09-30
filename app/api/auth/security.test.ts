import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createUser, getUserByUsername, hash } = vi.hoisted(() => ({
  createUser: vi.fn(),
  getUserByUsername: vi.fn(),
  hash: vi.fn(),
}));
vi.mock("@/src/server/sessions/store", () => ({ createUser, getUserByUsername }));
vi.mock("@/src/server/auth", () => ({ signToken: async () => "fixture-token" }));
vi.mock("bcryptjs", () => ({ default: { hash, compare: async () => false } }));

const request = (body: unknown, ip = "203.0.113.1") =>
  new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
  createUser.mockReset().mockResolvedValue("fixture-user");
  getUserByUsername.mockReset().mockResolvedValue(null);
  hash.mockReset().mockResolvedValue("fixture-hash");
});
afterEach(() => vi.unstubAllEnvs());

describe("credential request boundaries", () => {
  it.each(["x".repeat(73), "é".repeat(37)])("rejects passwords over bcrypt's UTF-8 byte limit", async (password) => {
    const { POST } = await import("./register/route");
    expect((await POST(request({ username: "alice", password }))).status).toBe(400);
    expect(hash).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("accepts a password at the byte boundary", async () => {
    const { POST } = await import("./register/route");
    expect((await POST(request({ username: "alice", password: "é".repeat(36) }))).status).toBe(201);
    expect(hash).toHaveBeenCalledWith("é".repeat(36), 10);
  });

  it("rejects null and non-object credentials without server errors", async () => {
    const { POST } = await import("./login/route");
    for (const body of [null, [], 1]) expect((await POST(request(body))).status).toBe(400);
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("limits account guesses across different trusted client addresses", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    const { POST } = await import("./login/route");
    for (let index = 0; index < 11; index++) {
      const input = request({ username: "alice", password: "wrong-password" });
      input.headers.set("x-real-ip", `203.0.113.${index}`);
      expect((await POST(input)).status).toBe(index < 10 ? 401 : 429);
    }
    expect(getUserByUsername).toHaveBeenCalledTimes(10);
  });

  it("cannot reset registration limits by changing forwarded headers", async () => {
    const { POST } = await import("./register/route");
    for (let index = 0; index < 5; index++) {
      expect(
        (await POST(request({ username: "alice", password: "safe-test-passphrase" }, `203.0.113.${index}`))).status,
      ).toBe(201);
    }
    expect((await POST(request({ username: "alice", password: "safe-test-passphrase" }, "203.0.113.99"))).status).toBe(
      429,
    );
    expect(hash).toHaveBeenCalledTimes(5);
  });
});

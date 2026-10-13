import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.resetModules();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("rate limiter admission boundaries", () => {
  it("retains limits for windows longer than the cleanup interval", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    const config = { windowMs: 900_000, maxRequests: 1 };
    expect(checkRateLimit("long-window", config).allowed).toBe(true);
    await vi.advanceTimersByTimeAsync(360_000);
    expect(checkRateLimit("long-window", config).allowed).toBe(false);
    await vi.advanceTimersByTimeAsync(540_000);
    expect(checkRateLimit("long-window", config).allowed).toBe(true);
  });

  it("refuses new keys at capacity without evicting active limits", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    const config = { windowMs: 60_000, maxRequests: 1 };
    for (let index = 0; index < 10_000; index++) {
      expect(checkRateLimit(`key-${index}`, config).allowed).toBe(true);
    }
    expect(checkRateLimit("overflow", config).allowed).toBe(false);
    expect(checkRateLimit("key-0", config).allowed).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(checkRateLimit("overflow", config).allowed).toBe(true);
  });

  it("canonicalizes IPv6 identities and rejects scoped addresses", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    const { getRateLimitIdentity } = await import("./rate-limit");
    const identity = (address: string) =>
      getRateLimitIdentity(
        new Request("http://localhost", {
          headers: { "x-real-ip": address },
        }),
      );
    expect(identity("2001:4860:4860:0:0:0:0:8888")).toBe(identity("2001:4860:4860::8888"));
    expect(identity("2001:4860:4860::8888")).not.toBe("unknown");
    expect(identity("fe80::1%eth0")).toBe("unknown");
  });

  it("ignores spoofed proxy headers unless an operator names a trusted header", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    const { getRateLimitIdentity } = await import("./rate-limit");
    const request = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(getRateLimitIdentity(request)).toBe("unknown");
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(getRateLimitIdentity(request)).toBe("unknown");
    expect(getRateLimitIdentity(new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.7" } }))).toBe(
      "203.0.113.7",
    );
    expect(getRateLimitIdentity(new Request("http://localhost", { headers: { "x-real-ip": "attacker" } }))).toBe(
      "unknown",
    );
    expect(
      getRateLimitIdentity(new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.7, 10.0.0.1" } })),
    ).toBe("unknown");
  });
});

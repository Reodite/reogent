import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("rate limiter", () => {
  const config = { windowMs: 1000, maxRequests: 3 };

  it("allows requests under the limit", () => {
    const key = `test-${Date.now()}-allow`;
    expect(checkRateLimit(key, config).allowed).toBe(true);
    expect(checkRateLimit(key, config).allowed).toBe(true);
    expect(checkRateLimit(key, config).allowed).toBe(true);
  });

  it("rejects requests at the limit", () => {
    const key = `test-${Date.now()}-reject`;
    checkRateLimit(key, config);
    checkRateLimit(key, config);
    checkRateLimit(key, config);
    const result = checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again after the window expires", async () => {
    const shortConfig = { windowMs: 50, maxRequests: 1 };
    const key = `test-${Date.now()}-expire`;
    checkRateLimit(key, shortConfig);
    expect(checkRateLimit(key, shortConfig).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(checkRateLimit(key, shortConfig).allowed).toBe(true);
  });
});

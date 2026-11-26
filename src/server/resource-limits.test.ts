import { afterEach, describe, expect, it, vi } from "vitest";
import { createCapacityLimit, MAX_TIMER_MS, positiveIntegerEnv } from "./resource-limits";

afterEach(() => vi.unstubAllEnvs());

describe("positiveIntegerEnv", () => {
  it("uses the fallback and accepts a bounded positive integer", () => {
    expect(positiveIntegerEnv("LIMIT_TEST", 5, 10)).toBe(5);
    vi.stubEnv("LIMIT_TEST", "10");
    expect(positiveIntegerEnv("LIMIT_TEST", 5, 10)).toBe(10);
  });

  it.each(["0", "-1", "1.5", "NaN", "11"])("rejects invalid value %s", (value) => {
    vi.stubEnv("LIMIT_TEST", value);
    expect(() => positiveIntegerEnv("LIMIT_TEST", 5, 10)).toThrow("LIMIT_TEST must be an integer");
  });

  it("caps timer values at the platform maximum", () => {
    expect(positiveIntegerEnv("LIMIT_TEST", MAX_TIMER_MS, MAX_TIMER_MS)).toBe(MAX_TIMER_MS);
  });
});

describe("createCapacityLimit", () => {
  it("rejects over-capacity work and releases each slot once", () => {
    const acquire = createCapacityLimit(1);
    const release = acquire();
    expect(release).toBeTypeOf("function");
    expect(acquire()).toBeNull();
    release?.();
    release?.();
    expect(acquire()).toBeTypeOf("function");
  });
});

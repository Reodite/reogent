import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatSeconds } from "./time";

describe("time formatter", () => {
  // Feature: reodite, Property 1: Time formatting is correct and zero-padded
  it("Property 1: formats any in-range second count as HH:MM that round-trips to the minute", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 86399 }), (s) => {
        const out = formatSeconds(s);
        expect(out).toMatch(/^\d{2}:\d{2}$/);
        const [hh, mm] = out.split(":").map(Number);
        expect(hh * 3600 + mm * 60).toBe(s - (s % 60));
      }),
      { numRuns: 200 },
    );
  });

  it("formats 55800 as 15:30", () => {
    expect(formatSeconds(55800)).toBe("15:30");
  });

  it("returns out-of-range input as the raw number string", () => {
    expect(formatSeconds(-1)).toBe("-1");
    expect(formatSeconds(86400)).toBe("86400");
    expect(formatSeconds(Number.NaN)).toBe("NaN");
  });
});

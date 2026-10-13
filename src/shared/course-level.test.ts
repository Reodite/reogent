import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchesLevel } from "./course-code";

describe("matchesLevel", () => {
  it("compares the course number's first digit with the requested level", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 999 }).map(String),
        fc.constantFrom("=", "+", "-"),
        fc.integer({ min: 1, max: 5 }),
        (number, op, digit) => {
          const level = Number(number[0]);
          const expected = op === "=" ? level === digit : op === "+" ? level >= digit : level <= digit;
          expect(matchesLevel(number, op, digit)).toBe(expected);
        },
      ),
    );
  });
});

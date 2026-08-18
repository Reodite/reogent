import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbCourseCode } from "./arb";
import { canonicalize } from "./course-code";

/** Property 1 — Canonical form invariant (REQ-1.1, REQ-1.2). */
describe("Property 1: canonical form invariant", () => {
  it("raw equals the uppercased subject + space + uppercased number", () => {
    fc.assert(
      fc.property(arbCourseCode, ({ input, subject, number }) => {
        const result = canonicalize(input);
        expect(result?.kind).toBe("code");
        if (result?.kind !== "code") return;
        const expected = `${subject.toUpperCase().replace(/_V$/, "")} ${number.toUpperCase()}`;
        expect(result.raw).toBe(expected);
      }),
    );
  });
});

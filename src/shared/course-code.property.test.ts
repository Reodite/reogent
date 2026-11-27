import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbCourseCode, arbOkanaganCode } from "./arb";
import { canonicalize } from "./course-code";

/** Canonicalizes supported course codes into a stable display form. */
describe("canonical course code form", () => {
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

/** Rejects Okanagan-suffixed inputs as course codes. */
describe("Okanagan course code rejection", () => {
  it("canonicalize of a _O-suffixed code never returns kind 'code'", () => {
    fc.assert(
      fc.property(arbOkanaganCode, (input) => {
        const result = canonicalize(input);
        expect(result?.kind).not.toBe("code");
      }),
    );
  });
});

/** Recognizes bare subject prefixes. */
describe("bare subject prefixes", () => {
  it("a 2-5 letter bare string canonicalizes to a subject prefix", () => {
    const arbBareSubject = fc.string({ minLength: 2, maxLength: 5 }).filter((s) => /^[A-Za-z]+$/.test(s));
    fc.assert(
      fc.property(arbBareSubject, (input) => {
        const result = canonicalize(input);
        expect(result?.kind).toBe("subject");
      }),
    );
  });
});

/** Re-canonicalizing a canonical result leaves it unchanged. */
describe("canonicalization idempotence", () => {
  it("canonicalize(canonicalize(s).raw) equals canonicalize(s)", () => {
    fc.assert(
      fc.property(arbCourseCode, ({ input }) => {
        const first = canonicalize(input);
        const second = first ? canonicalize(first.raw) : null;
        expect(second).toEqual(first);
      }),
    );
  });
});

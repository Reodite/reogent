import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbCourseCode, arbOkanaganCode } from "./arb";
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

/** Property 2 — Okanagan rejection invariant (REQ-1.3). */
describe("Property 2: no _O code emits kind 'code'", () => {
  it("canonicalize of a _O-suffixed code never returns kind 'code'", () => {
    fc.assert(
      fc.property(arbOkanaganCode, (input) => {
        const result = canonicalize(input);
        expect(result?.kind).not.toBe("code");
      }),
    );
  });
});

/** Property 3 — Subject-prefix shape (REQ-1.4). */
describe("Property 3: bare subjects produce kind 'subject'", () => {
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

/** Property 4 — Canonicalization idempotence (REQ-1.1). */
describe("Property 4: canonicalize is idempotent", () => {
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

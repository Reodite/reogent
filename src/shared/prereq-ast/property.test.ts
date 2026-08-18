import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbOkanaganCode, arbPrereqString, arbRecommendedTail } from "../arb";
import { parsePrereq } from "./index";
import { walkCodeLeaves } from "./walk";

/** Property 5 — No-throw (REQ-5.1, REQ-5.2, REQ-5.3): parsePrereq returns null or Expr for every string. */
describe("Property 5: parsePrereq never throws", () => {
  it("returns null or an Expr for any string (random bytes, unbalanced parens, NULs)", () => {
    fc.assert(
      fc.property(arbPrereqString, (s) => {
        let result: ReturnType<typeof parsePrereq> = undefined as never;
        expect(() => {
          result = parsePrereq(s);
        }).not.toThrow();
        expect(result === null || (typeof result === "object" && result !== null)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

/** Property 6 — Okanagan stripping (REQ-5.4): walkCodeLeaves yields no _O codes. */
describe("Property 6: no _O codes survive in walkCodeLeaves", () => {
  const arbOkanaganOnlyPrereq = fc
    .tuple(arbOkanaganCode, arbOkanaganCode, fc.constantFrom("and", "or", "one of", ""))
    .map(([a, b, join]) => (join === "one of" ? `one of ${a}, ${b}` : join ? `${a} ${join} ${b}` : a));
  it("parsePrereq of an _O-only string yields no _O codes", () => {
    fc.assert(
      fc.property(arbOkanaganOnlyPrereq, (s) => {
        const codes = walkCodeLeaves(parsePrereq(s)).map((l) => l.leaf.code);
        expect(codes.every((c) => !/_O/.test(c))).toBe(true);
      }),
    );
  });
});

/** Property 7 — Soft-tail only at top level (REQ-5.6): mid-clause recommended inside parens does not lift to a top-level Soft. */
describe("Property 7: mid-clause recommended produces no top-level Soft", () => {
  const arbMidClauseRecommended = fc
    .tuple(
      fc.constantFrom("CPSC 110", "MATH 100", "KIN_V 320", "AANB_V 500"),
      fc.constantFrom("is recommended", "is strongly recommended", "are recommended"),
    )
    .chain(([code, rec]) => fc.constantFrom(`${code} (${code} ${rec}) and ${code}`, `(${code} ${rec} and ${code}`));
  it("recommended inside parens (balanced or unbalanced) does not lift to a top-level Soft", () => {
    fc.assert(
      fc.property(arbMidClauseRecommended, (s) => {
        expect(parsePrereq(s)?.kind).not.toBe("soft");
      }),
    );
  });
});

/** Property 38 — Soft-tail positive split (REQ-5.5): a trailing top-level recommended tail produces a Soft root. */
describe("Property 38: trailing recommended tail produces a Soft root", () => {
  it("parsePrereq of a tail-shaped string has root kind 'soft'", () => {
    // ponytail: design.md composes the tail with an arbPrereqString prefix,
    // but a dot-bearing prefix splits hard/soft and yields an AND root, not a
    // soft root. Testing the tail alone matches the "root kind is 'soft'"
    // oracle in design.md:414.
    fc.assert(
      fc.property(arbRecommendedTail, (s) => {
        expect(parsePrereq(s)?.kind).toBe("soft");
      }),
    );
  });
});

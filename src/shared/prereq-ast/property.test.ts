import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbPrereqString } from "../arb";
import { parsePrereq } from "./index";

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

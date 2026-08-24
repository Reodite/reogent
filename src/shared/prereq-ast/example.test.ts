import { describe, expect, it } from "vitest";
import { displayExpr, parsePrereq } from "./index";
import { walkCodeLeaves } from "./walk";

/** Example test (REQ-5.6, REQ-1.2): mid-clause `recommended` does not produce a top-level Soft, and `_V` strips. */
describe("example: KIN 320 mid-clause recommended + AANB 500 _V strip", () => {
  it("AANB_V 500 parses to code AANB 500 with the _V suffix stripped", () => {
    const expr = parsePrereq("AANB_V 500.");
    expect(expr).not.toBeNull();
    const codes = walkCodeLeaves(expr).map((l) => l.leaf.code);
    expect(codes).toEqual(["AANB 500"]);
    expect(displayExpr(expr)).not.toMatch(/_V/);
  });

  it("KIN 320 mid-clause recommended inside parens produces no top-level Soft", () => {
    const expr = parsePrereq("KIN_V 320 (MATH 100 is recommended) and one of BIOL 112, BIOL 121.");
    expect(expr).not.toBeNull();
    expect(expr?.kind).not.toBe("soft");
  });
});

import { describe, expect, it } from "vitest";
import { parsePrereq } from "./index";
import { MAX_DEPTH, walkCodeLeaves } from "./walk";

describe("walkCodeLeaves", () => {
  it("returns parent null for a top-level code", () => {
    const expr = parsePrereq("CPSC 110");
    if (!expr) throw new Error("expected parsed expr");
    const leaves = walkCodeLeaves(expr);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].leaf.code).toBe("CPSC 110");
    expect(leaves[0].parent).toBeNull();
  });

  it("parents codes inside an and to the and node", () => {
    const expr = parsePrereq("MATH 100 and MATH 101");
    if (!expr) throw new Error("expected parsed expr");
    const leaves = walkCodeLeaves(expr);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.leaf.code).sort()).toEqual(["MATH 100", "MATH 101"].sort());
    const parents = new Set(leaves.map((l) => l.parent));
    expect(parents.size).toBe(1);
    expect([...parents][0]?.kind).toBe("and");
  });

  it("parents codes inside an or to the or node", () => {
    const expr = parsePrereq("one of MATH 100, MATH 101, MATH 102");
    if (!expr) throw new Error("expected parsed expr");
    const leaves = walkCodeLeaves(expr);
    expect(leaves).toHaveLength(3);
    const parents = new Set(leaves.map((l) => l.parent));
    expect([...parents][0]?.kind).toBe("or");
  });

  it("parents a code inside a soft wrapper to the soft node", () => {
    const expr = parsePrereq("MATH 100. MATH 101 is recommended");
    if (!expr) throw new Error("expected parsed expr");
    const leaves = walkCodeLeaves(expr);
    const codes = leaves.map((l) => l.leaf.code);
    expect(codes).toContain("MATH 101");
    const recommended = leaves.find((l) => l.leaf.code === "MATH 101");
    if (!recommended) throw new Error("expected MATH 101 leaf");
    expect(recommended.parent?.kind).toBe("soft");
  });

  it("does not descend into flattened text but walks subExpr", () => {
    const expr = parsePrereq("MATH 100. a score of 80% or higher in MATH 101");
    if (!expr) throw new Error("expected parsed expr");
    const leaves = walkCodeLeaves(expr);
    expect(leaves.length).toBeGreaterThanOrEqual(2);
    expect(leaves.map((l) => l.leaf.code)).toContain("MATH 100");
  });

  it("respects MAX_DEPTH as a finite positive ceiling", () => {
    expect(MAX_DEPTH).toBe(15);
  });
});

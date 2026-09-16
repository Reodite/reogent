import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbExpr, arbOkanaganCode, arbPrereqString, arbRecommendedTail } from "../arb";
import type { Expr } from "./index";
import { displayExpr, parsePrereq } from "./index";
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
    // design.md composes the tail with an arbPrereqString prefix,
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

/** Property 8 — Non-empty label (REQ-6.1, REQ-6.5): displayExpr(e) is non-empty for every Expr. */
describe("Property 8: displayExpr is non-empty", () => {
  it("displayExpr of any Expr yields a non-empty string", () => {
    fc.assert(
      fc.property(arbExpr, (e) => {
        expect(displayExpr(e).length).toBeGreaterThan(0);
      }),
    );
  });
});

/** Property 9 (REQ-6.6): labels preserve displayed code and clause text. */
describe("Property 9: display content preservation", () => {
  const displayedText = (expr: Expr): string[] => {
    if (expr.kind === "code") return [expr.code];
    if (expr.kind === "soft") return displayedText(expr.child);
    if (expr.kind === "and" || expr.kind === "or") return expr.children.flatMap(displayedText);
    return [expr.text || "(empty)"];
  };

  it("retains code and clause text through displayed branches", () => {
    fc.assert(
      fc.property(arbExpr, (expr) => {
        const label = displayExpr(expr);
        for (const text of displayedText(expr)) expect(label).toContain(text);
      }),
    );
  });

  it("preserves the seeded mixed-literal label", () => {
    const expr: Expr = {
      kind: "and",
      children: [
        { kind: "literal", text: " " },
        {
          kind: "or",
          ui: "dropdown",
          children: [
            { kind: "code", code: "AA 100" },
            { kind: "literal", text: ".AA00" },
          ],
        },
        { kind: "soft", child: { kind: "code", code: "AA 100" } },
      ],
    };
    expect(displayExpr(expr)).toBe("  + AA 100 / .AA00 + AA 100");
    for (const text of displayedText(expr)) expect(displayExpr(expr)).toContain(text);
  });

  it("allows distinct parsed expressions to share a display label", () => {
    const labels = ["permission. CPSC 110", "permission + CPSC 110"].map((input) => {
      const expr = parsePrereq(input);
      if (!expr) throw new Error("Expected a parsed expression");
      return { label: displayExpr(expr), codes: walkCodeLeaves(expr).map(({ leaf }) => leaf.code) };
    });
    expect(labels).toEqual([
      { label: "permission + CPSC 110", codes: ["CPSC 110"] },
      { label: "permission + CPSC 110", codes: [] },
    ]);
  });

  it.each<{ name: string; expr: Expr; label: string }>([
    {
      name: "conjunction",
      expr: {
        kind: "and",
        children: [
          { kind: "code", code: "MATH 100" },
          { kind: "code", code: "MATH 101" },
        ],
      },
      label: "MATH 100 + MATH 101",
    },
    {
      name: "disjunction with a soft branch",
      expr: {
        kind: "or",
        ui: "dropdown",
        children: [
          { kind: "soft", child: { kind: "code", code: "CPSC 110" } },
          { kind: "code", code: "MATH 100" },
        ],
      },
      label: "CPSC 110 / MATH 100",
    },
    {
      name: "flattened clause",
      expr: { kind: "flattened", text: "CPSC_V 110 with permission", subExpr: { kind: "code", code: "CPSC 110" } },
      label: "CPSC_V 110 with permission",
    },
    {
      name: "literal clause",
      expr: { kind: "literal", text: "permission + CPSC 110" },
      label: "permission + CPSC 110",
    },
  ])("preserves the $name label", ({ expr, label }) => {
    expect(displayExpr(expr)).toBe(label);
    for (const text of displayedText(expr)) expect(label).toContain(text);
  });
});

/** Property 10 — Soft-flattening (REQ-6.4): displayExpr(Soft(child)) === displayExpr(child). */
describe("Property 10: displayExpr flattens Soft", () => {
  it("wrapping an Expr in Soft does not change displayExpr output", () => {
    const arbSoft = arbExpr.map((child): Expr => ({ kind: "soft", child }));
    fc.assert(
      fc.property(arbSoft, ({ child }) => {
        expect(displayExpr({ kind: "soft", child })).toBe(displayExpr(child));
      }),
    );
  });
});

/** Property 39 — Code node canonical form output (REQ-6.2): every code leaf renders canonically. */
describe("Property 39: code leaves render in canonical form", () => {
  it("displays each Code leaf as SUBJECT NUM (uppercase, single space, no _V)", () => {
    fc.assert(
      fc.property(arbExpr, (e) => {
        for (const { leaf } of walkCodeLeaves(e)) {
          expect(displayExpr(leaf)).toMatch(/^[A-Z]{2,4} \d{2,4}[A-Z]?$/);
        }
      }),
    );
  });
});

/** Property 40 — And/Or separator presence (REQ-6.3): displayExpr joins And with ' + ' and Or with ' / '. */
describe("Property 40: And/Or separator presence", () => {
  const assertSeparators = (e: Expr): void => {
    switch (e.kind) {
      case "and":
        expect(displayExpr(e)).toBe(e.children.map(displayExpr).join(" + "));
        e.children.forEach(assertSeparators);
        return;
      case "or":
        expect(displayExpr(e)).toBe(e.children.map(displayExpr).join(" / "));
        e.children.forEach(assertSeparators);
        return;
      case "soft":
        assertSeparators(e.child);
        return;
    }
  };
  it("And nodes join with ' + ' and Or nodes join with ' / '", () => {
    fc.assert(fc.property(arbExpr, assertSeparators));
  });
});

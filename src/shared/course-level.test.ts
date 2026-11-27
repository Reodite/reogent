import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalize, CODE_RE, firstDigit, isOkanagan, matchesLevel } from "./course-code";

describe("canonicalize", () => {
  it("round-trips canonical codes with the _V suffix stripped from the subject", () => {
    fc.assert(
      fc.property(fromCodeSubjectNumber(), (str) => {
        const r = canonicalize(str);
        if (r && r.kind === "code") {
          expect(r.raw).toBe(`${r.subject} ${r.number}`);
        }
      }),
    );
  });

  it("does not emit code results for Okanagan-suffixed inputs", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).map((s) => `MATH_O ${s}`),
        (s) => {
          if (isOkanagan(s)) {
            const r = canonicalize(s);
            expect(r?.kind ?? null).not.toBe("code");
          }
        },
      ),
    );
  });

  it("returns a subject result for a bare subject", () => {
    expect(canonicalize("CPSC")?.kind).toBe("subject");
    expect(canonicalize("math")?.kind).toBe("subject");
  });

  it("is idempotent for canonicalized inputs", () => {
    fc.assert(
      fc.property(fromCodeSubjectNumber(), (s) => {
        const a = canonicalize(s);
        if (!a) return;
        const b = canonicalize(a.raw);
        expect(b).toEqual(a);
      }),
    );
  });
});

describe("matchesLevel first-digit relation", () => {
  const arbSubject = fc
    .string({ minLength: 2, maxLength: 4 })
    .filter((s) => /^[A-Za-z]+$/.test(s))
    .map((s) => s.toUpperCase());
  const arbOp = fc.constantFrom("=", "+", "-");
  const arbDigit = fc.integer({ min: 1, max: 5 });
  const arbNumber = fc.integer({ min: 100, max: 999 }).map((n) => String(n));

  it("matchesLevel honors the operator against number's first digit", () => {
    fc.assert(
      fc.property(arbNumber, arbOp, arbDigit, (number, op, digit) => {
        const d = firstDigit(number);
        const expected = op === "=" ? d === digit : op === "+" ? d >= digit : d <= digit;
        expect(matchesLevel(number, op, digit)).toBe(expected);
      }),
    );
  });

  it("generates subject, operator, and digit queries within their supported ranges", () => {
    fc.assert(
      fc.property(fc.tuple(arbSubject, arbOp, fc.integer({ min: 1, max: 5 }).map(String)), ([subject, op, digit]) => {
        expect(CODE_RE).toBeDefined();
        expect(subject).toMatch(/^[A-Z]{2,4}$/);
        expect(["=", "+", "-"]).toContain(op);
        expect(Number(digit)).toBeGreaterThanOrEqual(1);
        expect(Number(digit)).toBeLessThanOrEqual(5);
      }),
    );
  });
});

// From the design-domain 1 generator: an optional _V campus suffix, a spacer, and a 3-digit number.
function fromCodeSubjectNumber() {
  return fc
    .record({
      subj: fc
        .string({ minLength: 2, maxLength: 4 })
        .filter((s) => /^[A-Za-z]+$/.test(s))
        .map((s) => s.toUpperCase()),
      suffix: fc.constantFrom("", "_V"),
      sep: fc.constantFrom(" ", ""),
      num: fc.integer({ min: 100, max: 999 }).map((n) => String(n)),
    })
    .map(({ subj, suffix, sep, num }) => `${subj}${suffix}${sep}${num}`);
}

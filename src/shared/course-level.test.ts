import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalize, CODE_RE, firstDigit, isOkanagan, matchesLevel } from "./course-code";

describe("canonicalize (Property 1-4)", () => {
  it("round-trips: canonical code raw matches SUBJ NUM with _V stripped from subject (Property 1)", () => {
    fc.assert(
      fc.property(fromCodeSubjectNumber(), (str) => {
        const r = canonicalize(str);
        if (r && r.kind === "code") {
          expect(r.raw).toBe(`${r.subject} ${r.number}`);
        }
      }),
    );
  });

  it("Okanagan rejection: _O codes never emit kind 'code' (Property 2)", () => {
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

  it("bare subject returns kind 'subject' (Property 3)", () => {
    expect(canonicalize("CPSC")?.kind).toBe("subject");
    expect(canonicalize("math")?.kind).toBe("subject");
  });

  it("idempotence: canonicalize(raw) === canonicalize(canonicalize(s).raw) (Property 4)", () => {
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

describe("matchesLevel — first-digit relation (Property 37, REQ-3.1/3.2/3.3)", () => {
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

  it("arbLevelQuery generator shape: subject × op × digit (REQ-3.3 contract edge)", () => {
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

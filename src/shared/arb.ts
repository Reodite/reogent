import fc from "fast-check";
import { displayExpr } from "./prereq-ast";

/** Test-only fast-check generators ported from design.md §Correctness-Properties. */

// 2-4 letter UBC subject code, uppercased.
export const arbSubject = fc
  .string({ minLength: 2, maxLength: 4 })
  .filter((s) => /^[A-Za-z]+$/.test(s))
  .map((s) => s.toUpperCase());

/**
 * Domain-1 course code drawn to match canonicalize's CODE_RE: a 2-4 letter
 * subject, optional _V campus suffix, 1-3 spaces, and a 3-digit number with an
 * optional trailing letter. Returns the input plus the canonical components so
 * property oracles can assert the raw form.
 *
 * The glossary writes the number range as max 9999, but canonicalize's
 * CODE_RE matches exactly 3 digits and rejects 4-digit numbers at the anchored
 * boundary, so unrestricted draws break the Property 1 premise.
 */
export const arbCourseCode = fc
  .tuple(
    arbSubject,
    fc.integer({ min: 100, max: 999 }),
    fc.option(fc.constantFrom("A", "B", "C", "D", "E")),
    fc.boolean(),
    fc.integer({ min: 0, max: 3 }),
    fc.boolean(),
  )
  .map(([subject, num, letter, hasV, spaces, lowercase]) => {
    const number = letter ? `${num}${letter}` : String(num);
    const input = `${lowercase ? subject.toLowerCase() : subject}${hasV ? "_V" : ""}${" ".repeat(spaces)}${number}`;
    return { input, subject, number };
  });

/** Okanagan (_O) course code: subject + `_O` + 1-3 spaces + 3-digit number. */
export const arbOkanaganCode = fc
  .tuple(arbSubject, fc.integer({ min: 100, max: 999 }), fc.integer({ min: 1, max: 3 }))
  .map(([subject, num, spaces]) => `${subject}_O${" ".repeat(spaces)}${num}`);

/** Domain-2 generator: random bytes plus adversarial constants (design.md:409). */
export const arbPrereqString = fc.oneof(
  fc.string({ minLength: 0, maxLength: 2000 }),
  fc.constantFrom(
    "MATH 100",
    "one of MATH 100, MATH 102",
    "CPSC 110 is recommended",
    "KIN_V 320",
    "none.",
    "NoNE.",
    "NONE",
    "None.  ",
    "(())))",
    "\x00\x00CPSC 110",
    "",
  ),
);

/** UBC course number drawn as 100-5999 (design.md:502); parsePrereq's CODE_RE accepts 2-4 digits. */
const arbNumber = fc.integer({ min: 100, max: 5999 }).map(String);

/** A single canonical code leaf: `{ kind: 'code', code: 'SUBJ NUM' }` (design.md:503). */
export const arbCode = fc.record({
  kind: fc.constant("code"),
  code: fc.tuple(arbSubject, arbNumber).map(([s, n]) => `${s} ${n}`),
});

/** A literal leaf: `{ kind: 'literal', text }` with non-empty text (design.md:504). */
export const arbLiteral = fc.record({
  kind: fc.constant("literal"),
  text: fc.string({ minLength: 1, maxLength: 20 }),
});

/** Code-bearing expressions (a code or an AND of codes) for tail suffixes (design.md:505). */
export const arbCodeExpr = fc.oneof(
  arbCode,
  fc.record({ kind: fc.constant("and"), children: fc.array(arbCode, { minLength: 2 }) }),
);

/** Recursive Expr tree over code/literal/and/or/soft (design.md:424). */
export const arbExpr = fc.letrec((t) => ({
  code: arbCode,
  literal: arbLiteral,
  node: fc.oneof(
    t("code"),
    t("literal"),
    fc.array(t("node"), { minLength: 2 }).map((children) => ({ kind: "and", children })),
    fc.array(t("node"), { minLength: 2 }).map((children) => ({ kind: "or", ui: "dropdown" as const, children })),
    t("node").map((child) => ({ kind: "soft", child })),
  ),
})).node;

/**
 * Soft-tail suffix `X <recommended-phrase>` composed from a code expression
 * (design.md:414); pair with a prefix via `arbPrereqString` for Property 38.
 */
export const arbRecommendedTail = fc
  .tuple(arbCodeExpr, fc.constantFrom("is recommended", "is strongly recommended", "are recommended"))
  .map(([e, tail]) => `${displayExpr(e)} ${tail}`);

/**
 * Domain-4 dataset for BFS property tests (design.md:432). Each record pairs a
 * canonical course code with free-form prereq/coreq strings. The
 * generic `arbPrereqString` constants rarely collide with random `arbCourseCode`
 * draws, so most lookups miss and the graph stays shallow; the hand-crafted
 * cycle/depthCap tests in build-graph.test.ts cover the deep cases
 * deterministically, while these properties stress dedup, coreq depth, and the
 * no-coreq-of-coreq edge invariant across 30 random datasets.
 */
export const arbCourseDataset = fc.array(
  fc.record({
    code: arbCourseCode.map((c) => `${c.subject} ${c.number}`),
    prereq: arbPrereqString,
    coreq: arbPrereqString,
  }),
  { minLength: 1, maxLength: 40 },
);

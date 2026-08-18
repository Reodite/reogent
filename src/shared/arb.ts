import fc from "fast-check";

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
 * ponytail: glossary writes the number range as max 9999, but canonicalize's
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

/**
 * Course-code canonicalization for UBC Vancouver. Classifies a free-form
 * input as a canonical course code, a bare subject prefix, an Okanagan (_O)
 * rejection, or null. Canonical codes use the "SUBJ NUM" form: uppercase, the
 * Vancouver campus suffix (_V) stripped.
 */
export type CanonicalCode = {
  kind: "code";
  subject: string;
  number: string;
  raw: string;
};
export type SubjectPrefix = { kind: "subject"; subject: string; raw: string };
export type PartialCode = { kind: "partialCode"; subject: string; numberPrefix: string; raw: string };
export type Rejected = { kind: "rejected"; reason: "okanagan"; raw: string };
export type CanonicalResult = CanonicalCode | SubjectPrefix | PartialCode | Rejected | null;

/** Canonical course-code shape: 2-4 letter subject, 3-digit number, no campus suffix. */
export const CODE_RE = /\b([A-Za-z]{2,4})\s*([0-9]{3}[A-Za-z]?)\b/g;

// Extraction/classification accept an optional _V campus suffix, stripped from the raw form.
const V_CODE_RE = /\b([A-Za-z]{2,4})(?:_V)?\s*([0-9]{3}[A-Za-z]?)\b/g;
const ANCHORED_V_CODE_RE = /^([A-Za-z]{2,4})(?:_V)?\s*([0-9]{3}[A-Za-z]?)$/;
const PARTIAL_CODE_RE = /^([A-Za-z]{2,4})(?:_V)?\s*([0-9]{1,2}[A-Za-z]?)$/;
const OKANAGAN_RE = /\b[A-Za-z]{2,4}_O\b/;
const BARE_SUBJECT_RE = /^[A-Za-z]{2,5}$/;

/** True iff `raw` carries an `_O` (Okanagan) campus suffix. */
export function isOkanagan(raw: string): boolean {
  return OKANAGAN_RE.test(raw);
}

/** Classify `input` as a course code, partial code, subject prefix, Okanagan rejection, or null. */
export function canonicalize(input: string): CanonicalResult {
  const s = input.trim();
  if (!s) return null;
  if (isOkanagan(s)) return { kind: "rejected", reason: "okanagan", raw: s };
  const code = s.match(ANCHORED_V_CODE_RE);
  if (code) {
    const subject = code[1].toUpperCase();
    const number = code[2].toUpperCase();
    return { kind: "code", subject, number, raw: `${subject} ${number}` };
  }
  const partial = s.match(PARTIAL_CODE_RE);
  if (partial) {
    return { kind: "partialCode", subject: partial[1].toUpperCase(), numberPrefix: partial[2].toUpperCase(), raw: s };
  }
  if (BARE_SUBJECT_RE.test(s)) {
    const subject = s.toUpperCase();
    return { kind: "subject", subject, raw: subject };
  }
  return null;
}

/** Extract all canonical course codes (raw "SUBJ NUM" strings) from free-form text. */
export function extractCourseCodes(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(V_CODE_RE)) {
    if (isOkanagan(m[0])) continue;
    const code = `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** Level-operator kind for subject+level queries (`<subject> =3`, `+3`, `-3`). */
export type LevelOp = "=" | "+" | "-";

/** Leading digit of a course `number` field, e.g. `firstDigit("320") === 3`. Returns `NaN` for an empty string. */
export function firstDigit(number: string): number {
  return Number(String(number).charAt(0));
}

/** True iff `number`'s first digit satisfies the relation against `digit`: `=` equals, `+` at least, `-` at most. */
export function matchesLevel(number: string, op: LevelOp, digit: number): boolean {
  const d = firstDigit(number);
  return op === "=" ? d === digit : op === "+" ? d >= digit : d <= digit;
}

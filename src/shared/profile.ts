// The per-user student profile: optional defaults the agent uses for tuition,
// cost, and program tools instead of asking. Stored as one JSONB row per user.

export type StudentType = "domestic" | "international";

export interface StudentProfile {
  program?: string;
  /** Year of study, 1–7. */
  year?: number;
  student_type?: StudentType;
}

const MAX_PROGRAM_CHARS = 120;
const KEYS = new Set(["program", "year", "student_type"]);

/** Validates an untrusted body into a profile. Unknown keys, non-integer or
 * out-of-range years, and unrecognised student types are rejected. Blank
 * program strings are dropped rather than stored. */
export function parseProfile(body: unknown): { ok: true; value: StudentProfile } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be an object" };
  const raw = body as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) return { ok: false, error: `Unknown field: ${key}` };
  }
  const value: StudentProfile = {};
  if (raw.program !== undefined) {
    if (typeof raw.program !== "string" || raw.program.length > MAX_PROGRAM_CHARS) {
      return { ok: false, error: `program must be a string of at most ${MAX_PROGRAM_CHARS} characters` };
    }
    const program = raw.program.trim();
    if (program) value.program = program;
  }
  if (raw.year !== undefined) {
    if (!Number.isInteger(raw.year) || (raw.year as number) < 1 || (raw.year as number) > 7) {
      return { ok: false, error: "year must be an integer from 1 to 7" };
    }
    value.year = raw.year as number;
  }
  if (raw.student_type !== undefined) {
    if (raw.student_type !== "domestic" && raw.student_type !== "international") {
      return { ok: false, error: "student_type must be domestic or international" };
    }
    value.student_type = raw.student_type;
  }
  return { ok: true, value };
}

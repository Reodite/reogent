// The per-user student profile: optional defaults the agent uses for tuition,
// cost, and program tools instead of asking. Stored as one JSONB row per user.

export type StudentType = "domestic" | "international";
/** Saved appearance preference; system follows the device. */
export type ThemeMode = "light" | "dark" | "system";

/** Account details and preferences shared by onboarding, Settings, and the database. */
export interface StudentProfile {
  preferred_name?: string;
  program?: string;
  /** Year of study, 1–7. */
  year?: number;
  student_type?: StudentType;
  theme?: ThemeMode;
  onboarding_completed?: boolean;
}

const MAX_PROGRAM_CHARS = 120;
const KEYS = new Set(["preferred_name", "program", "year", "student_type", "theme", "onboarding_completed"]);

/** Validates an untrusted profile. Rejects unknown keys, invalid field types or
 * lengths, years outside 1–7, and unsupported student types or themes.
 * Trims names and programs and omits blank strings. */
export function parseProfile(body: unknown): { ok: true; value: StudentProfile } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be an object" };
  const raw = body as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) return { ok: false, error: `Unknown field: ${key}` };
  }
  const value: StudentProfile = {};
  if (raw.preferred_name !== undefined) {
    if (typeof raw.preferred_name !== "string" || raw.preferred_name.length > 64) {
      return { ok: false, error: "preferred_name must be a string of at most 64 characters" };
    }
    const name = raw.preferred_name.trim();
    if (name) value.preferred_name = name;
  }
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
  if (raw.theme !== undefined) {
    if (raw.theme !== "light" && raw.theme !== "dark" && raw.theme !== "system") {
      return { ok: false, error: "theme must be light, dark, or system" };
    }
    value.theme = raw.theme;
  }
  if (raw.onboarding_completed !== undefined) {
    if (typeof raw.onboarding_completed !== "boolean") {
      return { ok: false, error: "onboarding_completed must be a boolean" };
    }
    value.onboarding_completed = raw.onboarding_completed;
  }
  return { ok: true, value };
}

// Student-profile persistence: one JSONB row per user, last write wins. The
// API route validates the shape on write, so reads trust the stored value.
import type { StudentProfile } from "@/src/shared/profile";
import { getPool } from "./db";

/** The caller's saved profile, or null when none exists. */
export async function getProfile(userId: string): Promise<StudentProfile | null> {
  const { rows } = await getPool().query(`SELECT data FROM user_profiles WHERE user_id = $1`, [userId]);
  return rows.length > 0 ? (rows[0].data as StudentProfile) : null;
}

/** Upserts the caller's profile. */
export async function saveProfile(userId: string, data: StudentProfile): Promise<void> {
  await getPool().query(
    `INSERT INTO user_profiles (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify(data)],
  );
}

// Timetable persistence: one JSONB blob per user, last write wins. The
// payload stores section identifiers (course code + section + term) only;
// full section snapshots are a client-side cache concern.
import { getPool } from "./db";

/** The caller's saved schedule, or null when none exists. */
export async function getSchedule(userId: string): Promise<unknown | null> {
  const { rows } = await getPool().query(`SELECT data FROM schedules WHERE user_id = $1`, [userId]);
  return rows.length > 0 ? rows[0].data : null;
}

/** Upserts the caller's schedule. */
export async function saveSchedule(userId: string, data: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO schedules (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify(data)],
  );
}

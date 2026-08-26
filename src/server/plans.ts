// Degree-plan persistence: one JSONB blob per user, last write wins. The
// server treats the plan as opaque client state — shape validation beyond
// "is an object with a years array" lives client-side in the planner store.
import { getPool } from "./db";

/** The caller's saved plan, or null when none exists. */
export async function getPlan(userId: string): Promise<unknown | null> {
  const { rows } = await getPool().query(`SELECT data FROM degree_plans WHERE user_id = $1`, [userId]);
  return rows.length > 0 ? rows[0].data : null;
}

/** Upserts the caller's plan. */
export async function savePlan(userId: string, data: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO degree_plans (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify(data)],
  );
}

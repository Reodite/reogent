import { getPool } from "./db";

export async function listBuildingFavorites(userId: string): Promise<string[]> {
  const { rows } = await getPool().query(
    `SELECT building_code
     FROM building_favorites
     WHERE user_id = $1
     ORDER BY created_at DESC, building_code ASC`,
    [userId],
  );
  return rows.map((row) => String(row.building_code));
}

/** Applies the requested saved state idempotently and returns the account's ordered codes. */
export async function setBuildingFavorite(userId: string, buildingCode: string, saved: boolean): Promise<string[]> {
  const pool = getPool();
  if (saved) {
    await pool.query(
      `INSERT INTO building_favorites (user_id, building_code)
       VALUES ($1, $2)
       ON CONFLICT (user_id, building_code) DO NOTHING`,
      [userId, buildingCode],
    );
  } else {
    await pool.query(`DELETE FROM building_favorites WHERE user_id = $1 AND building_code = $2`, [
      userId,
      buildingCode,
    ]);
  }
  return listBuildingFavorites(userId);
}

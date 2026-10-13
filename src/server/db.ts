import pg from "pg";
import { MAX_TIMER_MS, positiveIntegerEnv } from "./resource-limits";

let pool: pg.Pool | undefined;

/** Returns a shared pool with validated connection and acquisition limits. */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL env var is not set");
    pool = new pg.Pool({
      connectionString,
      max: positiveIntegerEnv("DB_POOL_MAX", 10),
      connectionTimeoutMillis: positiveIntegerEnv("DB_POOL_TIMEOUT_MS", 5000, MAX_TIMER_MS),
    });
  }
  return pool;
}

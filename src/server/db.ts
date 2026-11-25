import pg from "pg";

let pool: pg.Pool | undefined;

/** Returns a shared connection pool. Reads DATABASE_URL from env. */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL env var is not set");
    // Bounds connection attempts so requests fail instead of hanging while Postgres is unreachable.
    pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000 });
  }
  return pool;
}

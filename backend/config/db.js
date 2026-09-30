/**
 * config/db.js
 * PostgreSQL connection pool. Works identically against the local brew cluster
 * and a Neon free-tier connection string (only DATABASE_URL changes).
 */
import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

// Neon and other serverless providers hand out a pooled URL; strip the flag so
// our own Pool does not multiplex twice.
const connectionString = env.databaseUrl.replace(/[?&]pgbouncer=true/i, "");

// Postgres returns BIGINT (int8) as a string by default to avoid precision loss.
// Every id in this schema is SERIAL and fits safely in a JS number.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new Pool({
  connectionString,
  ssl: env.databaseUrl.includes("neon.tech") || process.env.PGSSL === "true"
    ? { rejectUnauthorized: false }
    : false,
  max: env.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[DB] Idle client error:", err.message);
});

/** Run a query, return the result. */
export function query(text, params = []) {
  return pool.query(text, params);
}

/** Run a query, return rows. */
export async function many(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Run a query, return the first row or null. */
export async function one(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/** Return a single scalar value from the first row, or null. */
export async function scalar(text, params = []) {
  const row = await one(text, params);
  if (!row) return null;
  return Object.values(row)[0];
}

/**
 * Run `fn` inside a transaction. Rolls back on any throw.
 * `fn` receives a client with the same `query` signature.
 */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn({
      query: (text, params = []) => client.query(text, params),
      many: async (text, params = []) => (await client.query(text, params)).rows,
      one: async (text, params = []) => (await client.query(text, params)).rows[0] ?? null,
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function connectDB() {
  const row = await one("SELECT current_database() AS db, version() AS version");
  console.log(`[DB] PostgreSQL connected -> ${row.db}`);
  console.log(`[DB] ${row.version.split(" ").slice(0, 2).join(" ")}`);
  return row;
}

export async function closeDB() {
  await pool.end();
}

export default pool;

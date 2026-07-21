import { Pool } from "pg";

/**
 * Raw-`pg` access for the authenticated Playwright verticals. The Playwright
 * process is started by scripts/e2e/run-auth-e2e.mts with DATABASE_URL pointed at
 * the TEST database, so this connects to the exact same database the app server
 * uses. Used ONLY for (a) deterministic setup with no accepted UI requirement,
 * (b) DB verification after UI actions, and (c) isolated cleanup of this run's
 * uniquely-marked records — never to perform a product action a UI must own.
 */
let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL not set for e2e-auth DB access");
    pool = new Pool({ connectionString, max: 4 });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** The per-run marker set by the launcher; every record this run creates embeds it. */
export function runId(): string {
  return process.env.E2E_RUN_ID ?? "rlocal";
}

/** First row (or undefined) of a parameterised query. */
export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const { rows } = await db().query(sql, params);
  return rows[0] as T | undefined;
}

/** All rows of a parameterised query. */
export async function all<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await db().query(sql, params);
  return rows as T[];
}

/** Scalar count helper. */
export async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string }>(`SELECT count(*)::int AS n FROM (${sql}) _s`, params);
  return Number(row?.n ?? 0);
}

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { databaseSsl, databaseUrl } from "@/lib/env";

/**
 * Single shared connection pool. In UAT/Production DATABASE_URL points at the
 * RDS Proxy endpoint, so the application never opens direct connections to RDS.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      ssl: databaseSsl() ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/**
 * A minimal query surface implemented by both the pool and a transaction client.
 * Every data-access function accepts an optional trailing `Queryable` so it can
 * run either standalone or inside a transaction.
 */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export const db: Queryable = {
  query: (text, params) => getPool().query(text, params as unknown[]),
};

export type { PoolClient, QueryResult, QueryResultRow };

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

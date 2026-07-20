import { getPool, type Queryable } from "@/lib/db/pool";
import type { PoolClient } from "pg";

/**
 * Run `fn` inside a single database transaction. The callback receives a
 * `Queryable` (the transaction client) which must be threaded into every
 * data-access call that should participate in the transaction.
 *
 * Commits on success, rolls back on any thrown error, always releases the client.
 */
export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure; surface the original error
    }
    throw err;
  } finally {
    client.release();
  }
}

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";

/**
 * Idempotent forward-only migration runner.
 *
 * - Reads db/migrations/*.sql in lexical order.
 * - Records applied filenames in schema_migrations.
 * - Runs each pending migration inside its own transaction.
 * - Re-running is safe: already-applied migrations are skipped.
 *
 * Target database is chosen by the caller:
 *   - default: DATABASE_URL
 *   - pass --test to use TEST_DATABASE_URL
 */
export async function runMigrations(connectionString: string): Promise<string[]> {
  const dir = resolve(process.cwd(), "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const done = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(resolve(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed: ${file}\n${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

// Run directly: `npm run db:migrate` (optionally `-- --test`)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate.mts")) {
  loadEnv();
  const useTest = process.argv.includes("--test");
  const conn = useTest
    ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)
    : process.env.DATABASE_URL;
  if (!conn) {
    console.error("No connection string (DATABASE_URL / TEST_DATABASE_URL).");
    process.exit(1);
  }
  runMigrations(conn)
    .then((applied) => {
      if (applied.length === 0) {
        console.log("No pending migrations. Database is up to date.");
      } else {
        console.log(`Applied ${applied.length} migration(s):`);
        for (const f of applied) console.log(`  + ${f}`);
      }
    })
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    });
}

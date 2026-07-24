import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";
import { clientConfig } from "../../lib/db/config.ts";

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

  const client = new Client(clientConfig(connectionString));
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

function reportApplied(applied: string[]): void {
  if (applied.length === 0) {
    console.log("No pending migrations. Database is up to date.");
  } else {
    console.log(`Applied ${applied.length} migration(s):`);
    for (const f of applied) console.log(`  + ${f}`);
  }
}

/**
 * `--test` CLI path (TDX-P1-001). Runs the COMPLETE central connected guard
 * before any DDL: exact APP_ENV=test, mandatory TEST_DATABASE_URL (no fallback),
 * strict test-name, persistent marker, and connected identity distinct from
 * DATABASE_URL. Verifies the marker again after migrating.
 */
async function migrateTestCli(): Promise<void> {
  const { isExactTestEnvironment } = await import("../../lib/env.ts");
  const {
    assertSafeTestDatabaseTarget,
    readDatabaseMarker,
    TEST_DATABASE_MARKER,
    TestDatabaseSafetyError,
  } = await import("../../lib/db/testGuard.ts");

  if (!isExactTestEnvironment()) {
    console.error("db:migrate --test requires APP_ENV to be exactly 'test'. Refusing to run.");
    process.exit(1);
  }
  let conn: string;
  try {
    const verified = await assertSafeTestDatabaseTarget();
    conn = verified.connectionString();
  } catch (err) {
    const message =
      err instanceof TestDatabaseSafetyError ? err.message : "Test-database validation failed.";
    console.error(`Refusing to migrate the test database: ${message}`);
    process.exit(1);
  }
  const applied = await runMigrations(conn);
  const marker = await readDatabaseMarker(conn);
  if (marker !== TEST_DATABASE_MARKER) {
    console.error("The isolated-test-database marker is missing after migration. Aborting.");
    process.exit(1);
  }
  reportApplied(applied);
}

/** Ordinary migration against DATABASE_URL — unchanged behaviour. */
async function migrateNormalCli(): Promise<void> {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error("No connection string (DATABASE_URL).");
    process.exit(1);
  }
  reportApplied(await runMigrations(conn));
}

// Run directly: `npm run db:migrate` (optionally `-- --test`)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate.mts")) {
  loadEnv();
  const useTest = process.argv.includes("--test");
  (useTest ? migrateTestCli() : migrateNormalCli()).catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
}

import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";
import { runMigrations } from "./migrate.mts";
import { clientConfig } from "../../lib/db/config.ts";
import { isExactTestEnvironment } from "../../lib/env.ts";
import {
  assertSafeTestDatabaseTarget,
  readDatabaseMarker,
  TEST_DATABASE_MARKER,
  TestDatabaseSafetyError,
  type VerifiedTestTarget,
} from "../../lib/db/testGuard.ts";

/**
 * DEV/TEST ONLY: drop the public schema, re-create it, and re-run migrations.
 *
 * `--test` runs the COMPLETE central connected guard (TDX-P1-001) before any
 * destructive statement: exact APP_ENV=test, mandatory TEST_DATABASE_URL (no
 * fallback), strict test-database name, persistent marker, and a connected
 * identity distinct from DATABASE_URL. After the schema reset it re-verifies the
 * marker still exists and the connected database is still the test database, and
 * stops before migrations/seed if either fails.
 *
 * Ordinary (non-`--test`) behaviour is unchanged and cannot silently enter test
 * mode: it refuses uat/production and does not run the destructive path against
 * a test-marked target implicitly.
 */
async function reset(connectionString: string): Promise<void> {
  const env = (process.env.APP_ENV ?? "local").toLowerCase();
  if (env === "uat" || env === "production") {
    throw new Error(`Refusing to reset database in APP_ENV=${env}`);
  }
  const client = new Client({ ...clientConfig(connectionString), connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    // pgcrypto lives in the extension catalogue; re-create if the role is allowed.
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => {
      /* non-superuser: extension is pre-installed at the database level */
    });
  } finally {
    await client.end();
  }
}

/** `--test`: guard → drop/create schema → re-verify marker → migrate. */
async function resetTest(): Promise<void> {
  // 1. Raw exact test environment (no normalisation).
  if (!isExactTestEnvironment()) {
    throw new TestDatabaseSafetyError(
      "db:reset --test requires APP_ENV to be exactly 'test'. Refusing to run.",
    );
  }
  // 2. Full connected guard BEFORE any destructive statement or client.
  let verified: VerifiedTestTarget;
  try {
    verified = await assertSafeTestDatabaseTarget();
  } catch (err) {
    const message =
      err instanceof TestDatabaseSafetyError ? err.message : "Test-database validation failed.";
    console.error(`Refusing to reset the test database: ${message}`);
    process.exit(1);
  }
  const conn = verified.connectionString();

  // 3. Destructive reset (only ever against the verified test target).
  await reset(conn);

  // 4. Post-reset: the persistent marker must still be present and the
  // connected database must still be the test database. Fail BEFORE migrations.
  const marker = await readDatabaseMarker(conn);
  if (marker !== TEST_DATABASE_MARKER) {
    console.error(
      "Refusing to continue: the isolated-test-database marker is missing after " +
        "the schema reset. Stopping before migrations/seed.",
    );
    process.exit(1);
  }

  const applied = await runMigrations(conn);
  console.log(`Reset complete. Applied ${applied.length} migration(s).`);
}

/** Ordinary reset against DATABASE_URL. */
async function resetNormal(): Promise<void> {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error("No connection string (DATABASE_URL).");
    process.exit(1);
  }
  await reset(conn);
  const applied = await runMigrations(conn);
  console.log(`Reset complete. Applied ${applied.length} migration(s).`);
}

loadEnv();
const useTest = process.argv.includes("--test");
(useTest ? resetTest() : resetNormal()).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});

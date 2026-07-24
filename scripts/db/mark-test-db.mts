import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";
import { clientConfig } from "../../lib/db/config.ts";
import { isExactTestEnvironment } from "../../lib/env.ts";
import {
  parseDatabaseTarget,
  isStrictTestDatabaseName,
  requireTestDatabaseUrl,
  isSameDatabaseTarget,
  TEST_DATABASE_MARKER,
  TestDatabaseSafetyError,
} from "../../lib/db/testGuard.ts";

/**
 * EXPLICIT, one-time local provisioning of the isolated test-database marker
 * (TDX-P1-002 §3).
 *
 *     APP_ENV=test TEST_DATABASE_URL=... npm run db:test:mark
 *
 * This is the ONLY code path that writes `boostmyskills:test-only:v1`. It is
 * never invoked by test:unit, Vitest global setup, test:e2e:auth,
 * db:reset --test, db:migrate --test, build or verify.
 *
 * It refuses to mark anything but a strict `<name>_test` database that is not
 * the application database, connects only to TEST_DATABASE_URL, verifies
 * current_database() before writing, and prints only a safe confirmation.
 */
async function main(): Promise<void> {
  loadEnv();

  // 1. Raw exact test environment (no normalisation).
  if (!isExactTestEnvironment()) {
    throw new TestDatabaseSafetyError(
      "db:test:mark requires APP_ENV to be exactly 'test'. Refusing to run.",
    );
  }

  // 2-4. TEST_DATABASE_URL required; no fallback; parsed safely.
  const testUrl = requireTestDatabaseUrl();
  const target = parseDatabaseTarget(testUrl, "TEST_DATABASE_URL");

  // 5. Strict test-database name before connecting.
  if (!isStrictTestDatabaseName(target.database)) {
    throw new TestDatabaseSafetyError(
      "Refusing to mark: TEST_DATABASE_URL must name a dedicated '<name>_test' " +
        "database. This is not one.",
    );
  }

  // 6. Reject an obvious same target as the application database.
  const appUrl = process.env.DATABASE_URL;
  if (appUrl && appUrl.trim() !== "" && isSameDatabaseTarget(appUrl, testUrl)) {
    throw new TestDatabaseSafetyError(
      "Refusing to mark: TEST_DATABASE_URL resolves to the same target as the " +
        "application DATABASE_URL.",
    );
  }

  // 7. Connect only to TEST_DATABASE_URL.
  const client = new Client({ ...clientConfig(testUrl), connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    // 8-9. Verify current_database() and re-check the strict name / forbidden set.
    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    const connected = rows[0]?.db;
    if (connected !== target.database) {
      throw new TestDatabaseSafetyError(
        "Refusing to mark: the connected database does not match TEST_DATABASE_URL.",
      );
    }
    if (!isStrictTestDatabaseName(connected)) {
      throw new TestDatabaseSafetyError(
        "Refusing to mark: the connected database name is not an isolated test database.",
      );
    }

    // 10. Set exactly the marker. COMMENT ON DATABASE takes no bind parameters,
    // so both the identifier and the literal are quoted from known-safe values:
    // the identifier from the verified current_database(), and the literal from
    // the repository constant (already validated to contain no quote below).
    if (/'/.test(TEST_DATABASE_MARKER)) {
      throw new TestDatabaseSafetyError("Internal: marker constant contains an unsafe quote.");
    }
    const quotedIdent = '"' + connected.replace(/"/g, '""') + '"';
    await client.query(`COMMENT ON DATABASE ${quotedIdent} IS '${TEST_DATABASE_MARKER}'`);

    // 11. Verify after writing.
    const check = await client.query<{ marker: string | null }>(
      `SELECT shobj_description(oid, 'pg_database') AS marker
         FROM pg_database WHERE datname = current_database()`,
    );
    if (check.rows[0]?.marker !== TEST_DATABASE_MARKER) {
      throw new TestDatabaseSafetyError("Marker verification failed after writing.");
    }
  } finally {
    await client.end().catch(() => {});
  }

  // 12-13. Safe confirmation only — no URL, host, user, password or params.
  console.log("Isolated test database marker verified.");
}

main().catch((err) => {
  const message =
    err instanceof TestDatabaseSafetyError ? err.message : "Failed to mark the test database.";
  console.error(message);
  process.exit(1);
});

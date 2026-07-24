import { Client } from "pg";
// Relative + explicit .ts so this module resolves identically under Vitest (path
// alias) and under plain `node --experimental-strip-types` (CLI scripts).
import { clientConfig } from "./config.ts";
import { isExactTestEnvironment } from "../env.ts";

/**
 * Fail-closed isolation guard for the automated test database (FDX-P1-001).
 *
 * The regression this prevents: database-backed tests and the authenticated
 * Playwright harness used to fall back from TEST_DATABASE_URL to DATABASE_URL.
 * With TEST_DATABASE_URL unset, the suite would truncate the developer's
 * local/manual-review database.
 *
 * Rules enforced here — there is deliberately NO override/bypass variable:
 *   1. TEST_DATABASE_URL is mandatory; it never falls back to DATABASE_URL, a
 *      hardcoded localhost URL, a Docker default, or an inferred value.
 *   2. The raw APP_ENV must be exactly "test" before anything destructive runs.
 *   3. The test target must be a DIFFERENT database from the application one,
 *      compared on a canonical fingerprint that ignores the password and query
 *      parameters (so SSL flags or parameter order cannot disguise the same DB).
 *   4. After connecting, current_database() must equal the database named by
 *      TEST_DATABASE_URL.
 *
 * SERVER/TEST ONLY. Never import from client components. No function here ever
 * returns, logs or embeds a connection string, host, username or password.
 */

/**
 * Snapshot of the APPLICATION database URL, captured by the test entry points
 * BEFORE they repoint DATABASE_URL at the test database. Without it the
 * comparison in rule 3 would compare the test URL against itself.
 */
export const APP_DB_SNAPSHOT_VAR = "BMS_APP_DATABASE_URL";

export class TestDatabaseSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseSafetyError";
  }
}

/** Canonical, password-free identity of a database target. */
export interface DatabaseTarget {
  protocol: string;
  host: string;
  /** Effective port — PostgreSQL's default is applied when omitted. */
  port: string;
  user: string;
  database: string;
}

const DEFAULT_PG_PORT = "5432";
const ALLOWED_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/**
 * Parse a PostgreSQL connection string into its canonical target.
 * Throws a safe error (never echoing the value) when it is unusable.
 */
export function parseDatabaseTarget(raw: string, label: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TestDatabaseSafetyError(`${label} is not a valid PostgreSQL URL.`);
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new TestDatabaseSafetyError(`${label} must use the postgres:// scheme.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    throw new TestDatabaseSafetyError(`${label} does not name a database.`);
  }
  if (!url.hostname) {
    throw new TestDatabaseSafetyError(`${label} does not name a host.`);
  }
  return {
    // Normalise the two equivalent scheme spellings so they cannot differ.
    protocol: "postgres:",
    host: url.hostname.toLowerCase(),
    port: url.port === "" ? DEFAULT_PG_PORT : url.port,
    user: decodeURIComponent(url.username),
    database,
  };
}

/**
 * Comparison key for "is this the same database?".
 *
 * Deliberately excludes the password and every query parameter, so two URLs
 * that differ only by credentials, `?sslmode=`, or parameter ordering still
 * compare as the SAME target.
 */
export function targetFingerprint(t: DatabaseTarget): string {
  return [t.protocol, t.host, t.port, t.user, t.database].join("|");
}

/** True when both URLs identify the same database on the same host/port. */
export function isSameDatabaseTarget(a: string, b: string): boolean {
  return (
    targetFingerprint(parseDatabaseTarget(a, "A")) ===
    targetFingerprint(parseDatabaseTarget(b, "B"))
  );
}

/**
 * The mandatory test connection string. No fallback of any kind.
 */
export function requireTestDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (raw === undefined || raw.trim() === "") {
    throw new TestDatabaseSafetyError(
      "TEST_DATABASE_URL is required for database-backed tests. " +
        "It must point at an isolated test database and is never inferred from DATABASE_URL.",
    );
  }
  // Validate syntax now so callers fail before opening any connection.
  parseDatabaseTarget(raw, "TEST_DATABASE_URL");
  return raw;
}

/** The application database URL to compare against (snapshot preferred). */
function applicationDatabaseUrl(): string | undefined {
  const snapshot = process.env[APP_DB_SNAPSHOT_VAR];
  if (snapshot !== undefined && snapshot.trim() !== "") return snapshot;
  const live = process.env.DATABASE_URL;
  return live !== undefined && live.trim() !== "" ? live : undefined;
}

/**
 * Capture the application DATABASE_URL before an entry point repoints it at the
 * test database. Idempotent; safe to call more than once.
 */
export function snapshotApplicationDatabaseUrl(): void {
  const existing = process.env[APP_DB_SNAPSHOT_VAR];
  if (existing !== undefined && existing.trim() !== "") return;
  const live = process.env.DATABASE_URL;
  if (live !== undefined && live.trim() !== "") {
    process.env[APP_DB_SNAPSHOT_VAR] = live;
  }
}

/** Raw, exact environment check — no normalisation (consistent with FCX-P0-001). */
export function assertExactTestEnvironment(): void {
  if (!isExactTestEnvironment()) {
    throw new TestDatabaseSafetyError(
      "Destructive test-database operations require APP_ENV to be exactly 'test'.",
    );
  }
}

/**
 * Static half of the guard: environment, presence, syntax and distinctness.
 * Performs no I/O, so it is cheap enough to call on every destructive helper.
 *
 * @returns the validated TEST_DATABASE_URL
 */
export function assertIsolatedTestTarget(): string {
  assertExactTestEnvironment();
  const testUrl = requireTestDatabaseUrl();

  const appUrl = applicationDatabaseUrl();
  if (appUrl !== undefined) {
    let appTarget: DatabaseTarget;
    try {
      appTarget = parseDatabaseTarget(appUrl, "DATABASE_URL");
    } catch {
      // An unparseable application URL cannot be proven distinct → fail closed.
      throw new TestDatabaseSafetyError(
        "DATABASE_URL could not be parsed, so isolation from the test database " +
          "cannot be verified. Refusing to run destructive test operations.",
      );
    }
    const testTarget = parseDatabaseTarget(testUrl, "TEST_DATABASE_URL");
    if (targetFingerprint(appTarget) === targetFingerprint(testTarget)) {
      throw new TestDatabaseSafetyError(
        "TEST_DATABASE_URL must refer to an isolated database: it resolves to the " +
          "same host, port and database name as the application DATABASE_URL. " +
          "Refusing to run destructive test operations.",
      );
    }
  }
  return testUrl;
}

/**
 * Full guard: the static checks plus a short preflight connection that confirms
 * the server really is the intended test database.
 *
 * Call this before ANY truncate/drop/schema-reset in the automated suites.
 */
export async function assertSafeTestDatabaseTarget(): Promise<void> {
  const testUrl = assertIsolatedTestTarget();
  const expected = parseDatabaseTarget(testUrl, "TEST_DATABASE_URL");

  const client = new Client(clientConfig(testUrl));
  try {
    await client.connect();
  } catch {
    throw new TestDatabaseSafetyError(
      "Could not connect to the test database named by TEST_DATABASE_URL. " +
        "Refusing to run destructive test operations.",
    );
  }
  try {
    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    const actual = rows[0]?.db;
    if (actual !== expected.database) {
      throw new TestDatabaseSafetyError(
        "The connected database does not match the database named by " +
          "TEST_DATABASE_URL. Refusing to run destructive test operations.",
      );
    }
  } finally {
    await client.end().catch(() => {
      /* closing a preflight connection must never mask the real error */
    });
  }
}

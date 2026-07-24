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
 * TDX-P1-002 adds two INDEPENDENT identity requirements, because URL comparison
 * alone cannot see through host aliases (localhost / 127.0.0.1 / ::1 / Docker
 * names), differing usernames, or a missing DATABASE_URL:
 *   5. a strict repository-owned test-database NAME (`<name>_test`); and
 *   6. a persistent database MARKER comment; plus
 *   7. a connected-identity comparison (cluster start time + database OID) that
 *      rejects the same database however it was addressed.
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

/**
 * TDX-P1-002 — URL comparison alone cannot prove isolation (localhost vs
 * 127.0.0.1 vs ::1, Docker/DNS aliases, differing usernames, or a missing
 * DATABASE_URL). Two INDEPENDENT properties are therefore required of the test
 * database itself:
 *
 *   A. a strict, repository-owned database NAME rule, and
 *   B. a persistent database-level MARKER comment.
 *
 * The marker is stored with COMMENT ON DATABASE, which lives in the shared
 * pg_shdescription catalogue — so it SURVIVES `DROP SCHEMA public CASCADE` and
 * cannot be recreated by a schema reset.
 *
 * The test runner REQUIRES the marker and never creates or repairs it;
 * provisioning is an explicit one-time operator step (`npm run db:test:mark`).
 */
export const TEST_DATABASE_MARKER = "boostmyskills:test-only:v1";

/** Names that may never be treated as an isolated test database. */
const FORBIDDEN_DATABASE_NAMES = new Set([
  "bms",
  "boostmyskills",
  "boostmyskills_local",
  "postgres",
  "template0",
  "template1",
  "production",
  "prod",
  "uat",
  "staging",
  "stage",
  "live",
  "main",
  "test",
  "_test",
]);

/** Prefixes that must never be "promoted" to a test database by adding _test. */
const FORBIDDEN_NAME_PREFIXES = new Set(["production", "prod", "uat", "staging", "stage", "live"]);

/**
 * Strict test-database name rule.
 *
 * Requires a lower-case identifier with a MEANINGFUL prefix followed by the
 * exact suffix `_test` (e.g. `bms_test`). It deliberately does NOT accept a name
 * that merely contains "test" somewhere, nor a production-ish prefix.
 */
export function isStrictTestDatabaseName(name: string): boolean {
  if (typeof name !== "string") return false;
  const n = name.trim();
  if (n.length < 6 || n.length > 63) return false;
  if (FORBIDDEN_DATABASE_NAMES.has(n)) return false;
  // <prefix>_test where <prefix> starts with a letter and is at least 1 char.
  const m = /^([a-z][a-z0-9_]*)_test$/.exec(n);
  if (!m) return false;
  const prefix = m[1]!;
  if (prefix.length === 0) return false;
  if (FORBIDDEN_NAME_PREFIXES.has(prefix)) return false;
  return true;
}

/** Safe connected identity of a live PostgreSQL connection. Never logged. */
export interface ConnectedIdentity {
  database: string;
  /** OID of the connected database within its cluster. */
  databaseOid: string;
  /** Cluster identity — same value for every connection to the same server. */
  postmasterStartTime: string;
  /** NULL over a unix socket, so only ever supplementary evidence. */
  serverAddr: string | null;
  serverPort: string | null;
  /** The database-level marker comment, or null when absent. */
  marker: string | null;
}

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

const CONNECT_TIMEOUT_MS = 5_000;

/** The identity query. `shobj_description(..., 'pg_database')` is PG16-valid. */
const IDENTITY_SQL = `
  SELECT current_database()                                   AS database,
         (SELECT oid::text FROM pg_database
           WHERE datname = current_database())                AS database_oid,
         pg_postmaster_start_time()::text                     AS postmaster_start_time,
         inet_server_addr()::text                             AS server_addr,
         inet_server_port()::text                             AS server_port,
         (SELECT shobj_description(oid, 'pg_database') FROM pg_database
           WHERE datname = current_database())                AS marker
`;

/**
 * Read the safe connected identity. `readOnly` sets the session read-only so the
 * APPLICATION database connection can never write.
 */
async function readConnectedIdentity(url: string, readOnly: boolean): Promise<ConnectedIdentity> {
  const client = new Client({
    ...clientConfig(url),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  await client.connect();
  try {
    if (readOnly) {
      await client.query("SET default_transaction_read_only = on");
    }
    await client.query(`SET statement_timeout = ${CONNECT_TIMEOUT_MS}`);
    const { rows } = await client.query<{
      database: string | null;
      database_oid: string | null;
      postmaster_start_time: string | null;
      server_addr: string | null;
      server_port: string | null;
      marker: string | null;
    }>(IDENTITY_SQL);
    const r = rows[0];
    if (!r || !r.database || !r.database_oid || !r.postmaster_start_time) {
      throw new TestDatabaseSafetyError(
        "Connected database identity could not be established. " +
          "Refusing to run destructive test operations.",
      );
    }
    return {
      database: r.database,
      databaseOid: r.database_oid,
      postmasterStartTime: r.postmaster_start_time,
      // NULL over a unix socket — supplementary only, never required.
      serverAddr: r.server_addr,
      serverPort: r.server_port,
      marker: r.marker,
    };
  } finally {
    await client.end().catch(() => {
      /* closing a preflight connection must never mask the real error */
    });
  }
}

/**
 * Are two connections looking at the SAME database?
 *
 * Decided on server-reported identity, NOT on the URL — so every alias is
 * caught: localhost vs 127.0.0.1 vs ::1 vs a Docker/DNS name, differing
 * usernames or passwords, SSL parameters, and explicit vs implicit port.
 *
 * `pg_postmaster_start_time()` identifies the CLUSTER (identical for every
 * connection to that server); the database OID identifies the database within
 * it. Equal on both ⇒ the same database, however it was addressed. The database
 * name is also compared as a defensive second signal.
 *
 * Usernames are deliberately NOT part of this decision: connecting as a
 * different role does not make it a different database.
 */
export function isSameConnectedDatabase(a: ConnectedIdentity, b: ConnectedIdentity): boolean {
  if (a.postmasterStartTime !== b.postmasterStartTime) return false; // different cluster
  return a.databaseOid === b.databaseOid || a.database === b.database;
}

/**
 * An opaque proof that the test target was fully verified.
 *
 * Callers cannot fabricate one: the constructor is private to this module via a
 * module-local brand symbol, so a destructive helper that demands a
 * VerifiedTestTarget can only receive it from the guard.
 */
const VERIFIED_BRAND: unique symbol = Symbol("bms.verifiedTestTarget");

export class VerifiedTestTarget {
  /** @internal */
  private readonly [VERIFIED_BRAND] = true;
  private readonly url: string;
  readonly database: string;

  /** @internal — constructed only by assertSafeTestDatabaseTarget(). */
  constructor(brand: typeof VERIFIED_BRAND, url: string, database: string) {
    if (brand !== VERIFIED_BRAND) {
      throw new TestDatabaseSafetyError("VerifiedTestTarget cannot be constructed directly.");
    }
    this.url = url;
    this.database = database;
  }

  /**
   * The verified connection string, for callers that must hand one to pg or a
   * child process. Exposed only from an already-verified result.
   */
  connectionString(): string {
    return this.url;
  }
}

/**
 * FULL guard. Performs, in order:
 *   1. raw APP_ENV === "test"
 *   2. TEST_DATABASE_URL required
 *   3. parse it
 *   4. strict test-database NAME rule
 *   5. parse DATABASE_URL when present
 *   6. reject an obviously identical canonical URL target
 *   7. connect to the test target
 *   8. verify current_database, strict name and the persistent MARKER
 *   9. connect READ-ONLY to the application target when DATABASE_URL exists
 *  10. compare connected identities (alias-proof)
 *  11. return an opaque VerifiedTestTarget
 *
 * Call before ANY truncate / drop / schema-reset / migration in the suites.
 */
export async function assertSafeTestDatabaseTarget(): Promise<VerifiedTestTarget> {
  // 1-3, 6: environment, presence, syntax and canonical-URL distinctness.
  const testUrl = assertIsolatedTestTarget();
  const expected = parseDatabaseTarget(testUrl, "TEST_DATABASE_URL");

  // 4. Strict name rule — independent of any URL comparison.
  if (!isStrictTestDatabaseName(expected.database)) {
    throw new TestDatabaseSafetyError(
      "TEST_DATABASE_URL does not name an isolated test database. The database " +
        "name must be a dedicated '<name>_test' database. " +
        "Refusing to run destructive test operations.",
    );
  }

  // 7-8. Connect and verify identity + marker.
  let testIdentity: ConnectedIdentity;
  try {
    testIdentity = await readConnectedIdentity(testUrl, false);
  } catch (err) {
    if (err instanceof TestDatabaseSafetyError) throw err;
    throw new TestDatabaseSafetyError(
      "Could not connect to the database named by TEST_DATABASE_URL. " +
        "Refusing to run destructive test operations.",
    );
  }

  if (testIdentity.database !== expected.database) {
    throw new TestDatabaseSafetyError(
      "The connected database does not match the database named by " +
        "TEST_DATABASE_URL. Refusing to run destructive test operations.",
    );
  }
  if (!isStrictTestDatabaseName(testIdentity.database)) {
    throw new TestDatabaseSafetyError(
      "The connected database name does not satisfy the isolated-test-database " +
        "rule. Refusing to run destructive test operations.",
    );
  }
  if (testIdentity.marker !== TEST_DATABASE_MARKER) {
    throw new TestDatabaseSafetyError(
      "The target database is not marked as an isolated test database. Provision " +
        "it once with `npm run db:test:mark` (the test runner never creates this " +
        "marker automatically). Refusing to run destructive test operations.",
    );
  }

  // 9-10. Compare against the application database when one is configured.
  const appUrl = applicationDatabaseUrl();
  if (appUrl !== undefined) {
    let appIdentity: ConnectedIdentity | null = null;
    try {
      appIdentity = await readConnectedIdentity(appUrl, true);
    } catch {
      // Unreachable application DB is not proof of danger; the strict name +
      // marker above are independent guarantees. Continue without it.
      appIdentity = null;
    }
    if (appIdentity && isSameConnectedDatabase(testIdentity, appIdentity)) {
      throw new TestDatabaseSafetyError(
        "TEST_DATABASE_URL and DATABASE_URL resolve to the SAME database on the " +
          "same PostgreSQL server (detected from the server's own identity, not " +
          "the URL). Refusing to run destructive test operations.",
      );
    }
  }

  return new VerifiedTestTarget(VERIFIED_BRAND, testUrl, testIdentity.database);
}

/** Read the marker of an already-known-safe target (used for post-reset checks). */
export async function readDatabaseMarker(url: string): Promise<string | null> {
  const identity = await readConnectedIdentity(url, false);
  return identity.marker;
}

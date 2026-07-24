/**
 * Centralised, validated environment access.
 *
 * We deliberately do NOT throw at module load for every variable, because
 * different runtime surfaces (build, migration scripts, tests, request handlers)
 * need different subsets. Each accessor validates what it needs, when it needs it.
 */

export type AppEnvName = "local" | "test" | "uat" | "production";

/**
 * Normalised environment name for ORDINARY configuration/display purposes only
 * (labels, feature toggles that are not security boundaries).
 *
 * SECURITY: never use this to gate the test-authentication adapter. It
 * lower-cases, so `APP_ENV=TEST` would resolve to "test" here. Security
 * decisions must use `isExactTestEnvironment()` instead (FCX-P0-001).
 */
export function appEnv(): AppEnvName {
  const raw = (process.env.APP_ENV ?? "local").toLowerCase();
  if (raw === "local" || raw === "test" || raw === "uat" || raw === "production") {
    return raw;
  }
  return "local";
}

export function isProduction(): boolean {
  return appEnv() === "production";
}

/**
 * THE test-authentication security boundary.
 *
 * Compares the RAW `process.env.APP_ENV` against exactly "test" — no
 * lower/upper-casing, no trim, no prefix/substring match, no regex variants, no
 * NODE_ENV substitute and no default fallback. Anything other than the exact
 * lowercase string `test` (including "TEST", " test", "test\n", "testing",
 * missing, or empty) fails closed.
 *
 * This exists because the normalising `appEnv()` above would treat `APP_ENV=TEST`
 * as the test environment, which would let a mis-cased deployment variable enable
 * the test-identity adapter (FCX-P0-001).
 */
export function isExactTestEnvironment(): boolean {
  return process.env.APP_ENV === "test";
}

/**
 * Kept for non-security callers. Delegates to the exact check so no caller can
 * accidentally obtain a laxer test-environment answer.
 */
export function isTestEnv(): boolean {
  return isExactTestEnvironment();
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Connection string for the running application (app/dev/uat/prod). */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  return url;
}

/**
 * Connection string used ONLY by the automated test suite.
 *
 * FDX-P1-001: this MUST NOT fall back to DATABASE_URL. Falling back meant that
 * running the suite without TEST_DATABASE_URL pointed the destructive test
 * helpers (TRUNCATE / schema reset) at the developer's local database. The
 * variable is mandatory and is never inferred.
 *
 * The full isolation guard lives in lib/db/testGuard.ts; this accessor only
 * enforces presence + syntax so that non-destructive callers still fail closed.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error(
      "TEST_DATABASE_URL is required for database-backed tests. " +
        "It must point at an isolated test database and is never inferred from DATABASE_URL.",
    );
  }
  return url;
}

export function databaseSsl(): boolean {
  return (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true";
}

/**
 * The test-authentication adapter is a hard security boundary. It may activate
 * only when BOTH raw values are exact:
 *   - process.env.APP_ENV            === "test"
 *   - process.env.TEST_AUTH_ENABLED  === "true"
 *
 * Both comparisons are exact (no case folding, no trim, no default), so a
 * mis-cased or padded deployment variable can never switch the adapter on.
 * Activation additionally requires an exact server-only TEST_AUTH_SECRET and a
 * provisioned actor — enforced in lib/auth/identity.ts.
 */
export function testAuthEnabled(): boolean {
  if (!isExactTestEnvironment()) return false;
  return process.env.TEST_AUTH_ENABLED === "true";
}

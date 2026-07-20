/**
 * Centralised, validated environment access.
 *
 * We deliberately do NOT throw at module load for every variable, because
 * different runtime surfaces (build, migration scripts, tests, request handlers)
 * need different subsets. Each accessor validates what it needs, when it needs it.
 */

export type AppEnvName = "local" | "test" | "uat" | "production";

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

export function isTestEnv(): boolean {
  return appEnv() === "test";
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

/** Connection string used ONLY by the automated test suite. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL (or DATABASE_URL) must be set to run database tests.");
  }
  return url;
}

export function databaseSsl(): boolean {
  return (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true";
}

/**
 * The test-authentication adapter is a hard security boundary: it may only ever
 * activate when APP_ENV is exactly "test". This double-guards against a
 * production build ever honouring a test-identity header via a stray env var.
 */
export function testAuthEnabled(): boolean {
  if (appEnv() !== "test") return false;
  return (process.env.TEST_AUTH_ENABLED ?? "false").toLowerCase() === "true";
}

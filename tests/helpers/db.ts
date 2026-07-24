import { runMigrations } from "@/scripts/db/migrate.mts";
import { getPool, closePool, type Queryable } from "@/lib/db/pool";
import { assertSafeTestDatabaseTarget, type VerifiedTestTarget } from "@/lib/db/testGuard";

let migrated = false;
let verifiedTarget: VerifiedTestTarget | null = null;

/**
 * Verify test-database isolation once per process (FDX-P1-001 / TDX-P1-002).
 *
 * This helper is destructive, so it must fail closed EVEN IF called directly —
 * it may not rely on the package script or on tests/setup.ts having run. The
 * upgraded guard also requires the strict test-database name, the persistent
 * marker, and a connected identity distinct from the application database.
 */
async function ensureIsolatedTarget(): Promise<VerifiedTestTarget> {
  if (verifiedTarget) return verifiedTarget;
  verifiedTarget = await assertSafeTestDatabaseTarget();
  // Safe log: no host, database name, username or URL.
  console.log("Resetting isolated test database.");
  return verifiedTarget;
}

/** Apply migrations to the test database exactly once per process. */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  const target = await ensureIsolatedTarget();
  // Migrate the VERIFIED target, never a re-read env var.
  await runMigrations(target.connectionString());
  migrated = true;
}

const APP_TABLES = [
  "certificates",
  "assessment_attempts",
  "unit_progress",
  "enrollments",
  "programme_credentials",
  "credential_versions",
  "micro_programmes",
  "micro_credentials",
  "projects",
  "app_users",
];

/** Truncate all application tables (keeps schema + platform_settings singleton). */
export async function resetDb(): Promise<void> {
  // Destructive: re-assert isolation here too, so a direct call to resetDb()
  // (bypassing ensureMigrated) can never truncate the application database.
  await ensureIsolatedTarget();
  await ensureMigrated();
  const pool = getPool();
  // NOTE: platform_settings has an FK to app_users, so TRUNCATE ... CASCADE also
  // truncates the singleton row. We re-seed it immediately afterwards.
  await pool.query(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await pool.query(
    `INSERT INTO platform_settings (id, maintenance_mode, updated_by, updated_at)
     VALUES (1, false, NULL, now())
     ON CONFLICT (id) DO UPDATE SET maintenance_mode = false, updated_by = NULL, updated_at = now()`,
  );
}

export function q(): Queryable {
  return getPool();
}

export async function teardown(): Promise<void> {
  await closePool();
}

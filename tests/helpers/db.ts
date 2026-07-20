import { runMigrations } from "@/scripts/db/migrate.mts";
import { getPool, closePool, type Queryable } from "@/lib/db/pool";
import { testDatabaseUrl } from "@/lib/env";

let migrated = false;

/** Apply migrations to the test database exactly once per process. */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  await runMigrations(testDatabaseUrl());
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

import { Pool } from "pg";
import { requireTestDatabaseUrl, assertSafeTestDatabaseTarget } from "@/lib/db/testGuard";

/**
 * Seed the rows the authenticated verticals cannot auto-provision: admin
 * app_users whose clerk_user_id matches an admin test-auth actor. Learner actors
 * need no seed (a learner is lazily synced on first request; anonymous sends no
 * headers). Idempotent so re-runs are safe.
 *
 * Runs in the Playwright process. run-auth-e2e.mts has already verified and
 * repointed the database, but this writes to app_users, so it re-asserts
 * isolation itself and connects to TEST_DATABASE_URL explicitly rather than
 * trusting an inherited DATABASE_URL (FDX-P1-001).
 */

// Fixed actor for the authorization vertical (authz-vertical.spec.ts).
export const ADMIN_ACTOR = {
  clerkUserId: "e2e_admin_actor",
  email: "e2e-admin@example.test",
  username: "e2eadmin",
  firstName: "E2E",
  lastName: "Admin",
};

/** The per-run marker shared with the launcher and specs. */
export function runId(): string {
  return process.env.E2E_RUN_ID ?? "rlocal";
}

/** Product-vertical admin actor — unique per run so it is isolated + cleanable. */
export function productAdminActor() {
  const r = runId();
  return {
    clerkUserId: `e2e_prod_admin_${r}`,
    email: `e2e-prod-admin-${r}@example.test`,
    username: `prodadmin${r}`,
    firstName: "Prod",
    lastName: "Admin",
  };
}

export default async function globalSetup(): Promise<void> {
  // Writes to app_users → prove isolation before connecting.
  await assertSafeTestDatabaseTarget();
  const connectionString = requireTestDatabaseUrl();
  const pool = new Pool({ connectionString });
  try {
    for (const a of [ADMIN_ACTOR, productAdminActor()]) {
      await pool.query(
        `INSERT INTO app_users (clerk_user_id, email, username, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, 'admin')
         ON CONFLICT (clerk_user_id) DO UPDATE SET role = 'admin'`,
        [a.clerkUserId, a.email, a.username, a.firstName, a.lastName],
      );
    }
  } finally {
    await pool.end();
  }
}

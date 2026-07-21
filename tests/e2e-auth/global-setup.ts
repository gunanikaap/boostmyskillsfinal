import { Pool } from "pg";

/**
 * Seed the ONE row the authenticated vertical cannot auto-provision: an admin
 * app_user whose clerk_user_id matches the admin test-auth actor. Learner and
 * anonymous actors need no seed (a learner is lazily synced on first request;
 * anonymous sends no headers). Idempotent so re-runs are safe.
 *
 * Runs in the Playwright process, which run-auth-e2e.mts has already pointed at
 * the test database (DATABASE_URL := TEST_DATABASE_URL).
 */
export const ADMIN_ACTOR = {
  clerkUserId: "e2e_admin_actor",
  email: "e2e-admin@example.test",
  username: "e2eadmin",
  firstName: "E2E",
  lastName: "Admin",
};

export default async function globalSetup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set for e2e-auth global setup");
  const pool = new Pool({ connectionString });
  try {
    await pool.query(
      `INSERT INTO app_users (clerk_user_id, email, username, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       ON CONFLICT (clerk_user_id) DO UPDATE SET role = 'admin'`,
      [
        ADMIN_ACTOR.clerkUserId,
        ADMIN_ACTOR.email,
        ADMIN_ACTOR.username,
        ADMIN_ACTOR.firstName,
        ADMIN_ACTOR.lastName,
      ],
    );
  } finally {
    await pool.end();
  }
}

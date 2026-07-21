/**
 * Launcher for the authenticated Playwright vertical (test-auth adapter).
 *
 * It boots the app under APP_ENV=test with the secret-gated test-auth adapter and
 * NO Clerk key (so the edge middleware is a pass-through and server-side
 * requireAdmin()/getCurrentAppUser() remain the sole authorization boundary,
 * resolving identity from the per-request test-auth headers).
 *
 * This is TEST-AUTH-BACKED automation, NOT Clerk-backed. Real Clerk automated
 * E2E stays PARTIAL (see docs/uat/known-blockers.md). The secret never touches
 * Git: it is generated per run below and passed only in-process.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadEnv } from "./../_loadEnv.mts";

loadEnv();

// Force the isolated test surface.
process.env.APP_ENV = "test";
process.env.TEST_AUTH_ENABLED = "true";
// Ephemeral per-run secret — required by the adapter, never committed.
process.env.TEST_AUTH_SECRET = randomBytes(24).toString("hex");
// The application pool must talk to the test database, never dev/prod.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
// Blank (do NOT delete) any Clerk key so clerkConfigured() is false → middleware
// pass-through and no ClerkProvider (auth is proven here via the test-auth adapter
// only). Empty strings are "defined", so `next dev` will not re-populate them from
// .env.local (which does hold the dev Clerk key); deleting them would let Next
// reload the key and re-enable the Clerk redirect.
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
process.env.CLERK_SECRET_KEY = "";

const res = spawnSync("npx", ["playwright", "test", "--config", "playwright.e2e-auth.config.ts"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
process.exit(res.status ?? 1);

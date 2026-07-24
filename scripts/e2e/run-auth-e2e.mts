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
import {
  snapshotApplicationDatabaseUrl,
  requireTestDatabaseUrl,
  assertSafeTestDatabaseTarget,
  TestDatabaseSafetyError,
} from "../../lib/db/testGuard.ts";

loadEnv();

// Force the isolated test surface.
process.env.APP_ENV = "test";
process.env.TEST_AUTH_ENABLED = "true";
// Ephemeral per-run secret — required by the adapter, never committed.
process.env.TEST_AUTH_SECRET = randomBytes(24).toString("hex");
// Unique per-run marker shared with global-setup + specs (isolates this run's
// records for the product vertical so cleanup only ever touches its own rows).
process.env.E2E_RUN_ID = `r${randomBytes(5).toString("hex")}`;
// Isolate uploaded object data under an ignored test-only storage root.
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_ROOT = ".data/e2e-storage";
// --- Test-database isolation preflight (FDX-P1-001) --------------------------
//
// This ran as a CONDITIONAL repoint, so with TEST_DATABASE_URL unset the whole
// authenticated run (which seeds actors and truncates rows) executed against the
// developer's database. The repoint is now unconditional, and every check below
// happens BEFORE the Next build, before any server starts, before migrations and
// before any seeding — so a misconfigured run modifies nothing at all.
//
// Order: exact APP_ENV -> TEST_DATABASE_URL present -> valid syntax -> distinct
// from DATABASE_URL -> preflight connection -> current_database() verified.
snapshotApplicationDatabaseUrl();
try {
  const testDatabaseUrl = requireTestDatabaseUrl();
  await assertSafeTestDatabaseTarget();
  process.env.DATABASE_URL = testDatabaseUrl;
  console.log("Test-database isolation verified.");
} catch (err) {
  // Safe reason only — never the URL, host, user or password.
  const reason =
    err instanceof TestDatabaseSafetyError ? err.message : "Test-database validation failed.";
  console.error(`Refusing to run the authenticated E2E suite: ${reason}`);
  process.exit(1);
}
// Blank (do NOT delete) any Clerk key so clerkConfigured() is false → middleware
// pass-through and no ClerkProvider (auth is proven here via the test-auth adapter
// only). Empty strings are "defined", so `next dev` will not re-populate them from
// .env.local (which does hold the dev Clerk key); deleting them would let Next
// reload the key and re-enable the Clerk redirect.
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
process.env.CLERK_SECRET_KEY = "";

// Serve a PRODUCTION build (not `next dev`). The dev server compiles routes on
// demand and accumulates a webpack cache that can exhaust memory across this long
// serial suite (observed: VirtualAlloc/Array-buffer allocation failures mid-run).
// A one-shot build + `next start` has a flat, low memory profile and no per-route
// compile latency. The build lands in an isolated distDir (see next.config.mjs).
process.env.E2E_AUTH_DIST = "1";
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=4096"]
  .filter(Boolean)
  .join(" ");

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
if (build.status !== 0) {
  console.error("next build failed; aborting authenticated E2E run.");
  process.exit(build.status ?? 1);
}

// Forward any extra args (e.g. `-- --grep "product vertical"`) to Playwright.
const extra = process.argv.slice(2);
const res = spawnSync(
  "npx",
  ["playwright", "test", "--config", "playwright.e2e-auth.config.ts", ...extra],
  { stdio: "inherit", env: process.env, shell: true },
);
process.exit(res.status ?? 1);

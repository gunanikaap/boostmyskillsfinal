import { loadEnv } from "@/scripts/_loadEnv.mts";
import {
  requireTestDatabaseUrl,
  snapshotApplicationDatabaseUrl,
  assertIsolatedTestTarget,
  assertSafeTestDatabaseTarget,
} from "@/lib/db/testGuard";

// Load .env.local/.env, then force the test environment.
loadEnv();
process.env.APP_ENV = "test";
// Enable the test-auth adapter so guards can resolve an injected identity.
// This is double-gated: testAuthEnabled() also requires APP_ENV === "test".
process.env.TEST_AUTH_ENABLED = "true";

// --- Test-database isolation (FDX-P1-001 / TDX-P1-002) -----------------------
//
// Previously this block was conditional:
//
//     if (process.env.TEST_DATABASE_URL) { DATABASE_URL = TEST_DATABASE_URL }
//
// so with TEST_DATABASE_URL unset the application pool kept pointing at the
// developer's database — which resetDb() then truncated. TEST_DATABASE_URL is
// now MANDATORY and the repoint is UNCONDITIONAL: the pool can only ever reach
// the isolated test database.
//
// The application URL is snapshotted first so the guard can still prove the two
// targets are distinct after the repoint.
snapshotApplicationDatabaseUrl();
const testDatabaseUrl = requireTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;

// Static, synchronous fail-fast (no I/O) before anything imports the pool.
assertIsolatedTestTarget();

// Full connected guard (strict test-database name + persistent marker +
// connected identity distinct from DATABASE_URL) before any suite in this worker
// touches the database. setupFiles support top-level await.
await assertSafeTestDatabaseTarget();

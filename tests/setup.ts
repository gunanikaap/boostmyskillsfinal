import { loadEnv } from "@/scripts/_loadEnv.mts";

// Load .env.local/.env, then force the test environment.
loadEnv();
process.env.APP_ENV = "test";
// Enable the test-auth adapter so guards can resolve an injected identity.
// This is double-gated: testAuthEnabled() also requires APP_ENV === "test".
process.env.TEST_AUTH_ENABLED = "true";
// The application pool must talk to the test database, never the dev/prod one.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

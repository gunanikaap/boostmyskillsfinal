import { defineConfig, devices } from "@playwright/test";

/**
 * Authenticated Playwright vertical — TEST-AUTH-BACKED (not Clerk-backed).
 *
 * Launch only via `npm run test:e2e:auth`, which sets APP_ENV=test, enables the
 * secret-gated test-auth adapter, points DATABASE_URL at the test database, and
 * removes the Clerk key. The dev server here therefore has the edge middleware as
 * a pass-through, and identity is resolved per request from the test-auth headers
 * set by each browser context. Real Clerk automated E2E remains PARTIAL.
 */
export default defineConfig({
  testDir: "./tests/e2e-auth",
  globalSetup: "./tests/e2e-auth/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3101",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production server built by scripts/e2e/run-auth-e2e.mts (into the isolated
    // .next-e2e-auth distDir) — flat, low memory profile for the long serial run.
    command: "npx next start -p 3101",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 120_000,
    // Inherit the APP_ENV=test / TEST_AUTH_* / DATABASE_URL / no-Clerk-key
    // environment established by scripts/e2e/run-auth-e2e.mts.
    env: process.env as Record<string, string>,
  },
});

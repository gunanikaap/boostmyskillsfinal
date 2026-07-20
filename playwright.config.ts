import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for critical, auth-agnostic journeys. Starts a real `next dev`
 * server on port 3100 (loads .env.local, so Clerk renders with the dev keys).
 * Auth-requiring journeys are proven manually against the Clerk Development
 * instance (see docs/uat/local-foundation-completion-report.md).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

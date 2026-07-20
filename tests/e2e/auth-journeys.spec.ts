import { test, expect } from "@playwright/test";

/**
 * Critical, auth-agnostic journeys against a real dev server with Clerk dev keys.
 * Journeys that require an authenticated session (signup/verify/login/logout) are
 * proven manually against the Clerk Development instance and recorded in
 * docs/uat/local-foundation-completion-report.md.
 */

test("public home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText(/micro-credentials/i);
});

test("public catalogue is accessible", async ({ page }) => {
  const res = await page.goto("/courses");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("h1")).toContainText(/micro-credentials/i);
});

test("sign-in page renders Clerk", async ({ page }) => {
  await page.goto("/sign-in");
  // Clerk's SignIn component renders its own UI (root box / sign-in text / inputs).
  await expect(page.locator("body")).toContainText(/sign in/i, { timeout: 15_000 });
});

test("sign-up page renders Clerk", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.locator("body")).toContainText(/sign up|create your account/i, {
    timeout: 15_000,
  });
});

test("anonymous /dashboard redirects to sign-in with a safe return URL", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  // The middleware preserves the intended destination as a same-origin return URL.
  expect(page.url()).toContain("redirect_url");
  expect(page.url()).toContain("dashboard");
});

test("anonymous /admin is denied (redirected to sign-in)", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an external return URL never navigates off-origin", async ({ page }) => {
  await page.goto("/sign-in?redirect_url=https://evil.example/steal");
  // We must remain on our own origin (Clerk validates redirects; our
  // safeReturnPath guards server return paths).
  expect(new URL(page.url()).host).toBe("localhost:3100");
});

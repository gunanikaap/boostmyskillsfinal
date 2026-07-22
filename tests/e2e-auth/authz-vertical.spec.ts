import { test, expect, type Browser } from "@playwright/test";
import { ADMIN_ACTOR } from "./global-setup";

/**
 * Authenticated vertical — TEST-AUTH-BACKED (not Clerk-backed).
 *
 * Each browser context carries the secret-gated test-auth headers, so the real
 * HTTP + SSR + server-side authorization stack (requireAdmin / getCurrentAppUser)
 * resolves a per-request identity exactly as it would for a Clerk session. This
 * proves role enforcement end to end through a browser. Clerk-session automation
 * remains PARTIAL; the underlying business vertical is covered by the 149 Vitest
 * integration tests against real PostgreSQL.
 */

const SECRET = process.env.TEST_AUTH_SECRET ?? "";

const LEARNER_ACTOR = {
  clerkUserId: "e2e_learner_actor",
  email: "e2e-learner@example.test",
  username: "e2elearner",
  firstName: "E2E",
  lastName: "Learner",
};

function headersFor(actor: Record<string, unknown> | null): Record<string, string> {
  if (!actor) return {};
  return { "x-test-auth-secret": SECRET, "x-test-actor": JSON.stringify(actor) };
}

test.beforeAll(() => {
  expect(SECRET, "TEST_AUTH_SECRET must be injected by run-auth-e2e.mts").not.toBe("");
});

async function pageAs(browser: Browser, actor: Record<string, unknown> | null) {
  const context = await browser.newContext({ extraHTTPHeaders: headersFor(actor) });
  const page = await context.newPage();
  return { context, page };
}

test.describe("authenticated authorization vertical (test-auth)", () => {
  test("anonymous /dashboard prompts sign-in", async ({ browser }) => {
    const { context, page } = await pageAs(browser, null);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your learning" })).toBeVisible();
    await expect(page.getByText(/to see your enrolments/i)).toBeVisible();
    await context.close();
  });

  test("learner identity resolves through the browser on /dashboard", async ({ browser }) => {
    const { context, page } = await pageAs(browser, LEARNER_ACTOR);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your learning" })).toBeVisible();
    // Authenticated-but-unenrolled learner sees their empty state, not the sign-in prompt.
    await expect(page.getByText(/not enrolled in anything yet/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /view your certificates/i })).toBeVisible();
    await context.close();
  });

  test("learner is denied /admin by the server-side boundary", async ({ browser }) => {
    const { context, page } = await pageAs(browser, LEARNER_ACTOR);
    await page.goto("/admin");
    await expect(page.getByText(/do not have administrator access/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toHaveCount(0);
    await context.close();
  });

  test("anonymous is denied /admin with a sign-in notice", async ({ browser }) => {
    const { context, page } = await pageAs(browser, null);
    await page.goto("/admin");
    await expect(
      page.getByText(/requires signing in with an administrator account/i),
    ).toBeVisible();
    await context.close();
  });

  test("admin actor reaches the admin dashboard and nav", async ({ browser }) => {
    const { context, page } = await pageAs(browser, ADMIN_ACTOR);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
    // Admin top bar nav (the brand is now a logo + "Admin" tag; assert a stable nav link).
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    await page.goto("/admin/programmes");
    await expect(page).toHaveURL(/\/admin\/programmes$/);
    await context.close();
  });

  test("a forged header without the secret cannot become admin", async ({ browser }) => {
    // Same actor payload, but the WRONG secret → adapter returns null → anonymous.
    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-test-auth-secret": "not-the-secret",
        "x-test-actor": JSON.stringify(ADMIN_ACTOR),
      },
    });
    const page = await context.newPage();
    await page.goto("/admin");
    await expect(
      page.getByText(/requires signing in with an administrator account/i),
    ).toBeVisible();
    await context.close();
  });
});

import { test, expect } from "@playwright/test";

/**
 * Public frontend parity smokes against the seeded local demo catalogue
 * (global-setup runs the idempotent db:seed:ui). Auth-agnostic, public pages only.
 */

test("homepage renders seeded featured programmes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Our Trending Micro-programmes" })).toBeVisible();
  await expect(page.getByText("Advanced Design of Sustainable Cities").first()).toBeVisible();
});

test("/courses lists published seeded credentials; drafts/hidden absent", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "Micro-credentials", exact: true })).toBeVisible();
  await expect(page.getByText("Fundamentals of Energy Systems").first()).toBeVisible();
  await expect(page.getByText("Introduction to Renewable Energies").first()).toBeVisible();
  await expect(page.getByText("Draft Preview Credential")).toHaveCount(0);
  await expect(page.getByText("Hidden Preview Credential")).toHaveCount(0);
});

test("/courses search filters to a seeded credential", async ({ page }) => {
  await page.goto("/courses");
  await page.getByLabel("Search micro-credentials").fill("Renewable");
  await expect(page.getByText("Introduction to Renewable Energies").first()).toBeVisible();
  await expect(page.getByText("Fundamentals of Energy Systems")).toHaveCount(0);
});

test("/programs lists published seeded programmes with members; drafts/hidden absent", async ({
  page,
}) => {
  await page.goto("/programs");
  await expect(page.getByRole("heading", { name: "Micro-programmes", exact: true })).toBeVisible();
  await expect(page.getByText("Advanced Design of Sustainable Cities").first()).toBeVisible();
  await expect(page.getByText("Includes the following micro-credentials").first()).toBeVisible();
  await expect(page.getByText("Draft Preview Programme")).toHaveCount(0);
  await expect(page.getByText("Hidden Preview Programme")).toHaveCount(0);
});

test("credential detail shows banner, title, code, organisation, about", async ({ page }) => {
  await page.goto("/courses/fundamentals-of-energy-systems");
  await expect(page.getByRole("heading", { name: "Fundamentals of Energy Systems" })).toBeVisible();
  await expect(page.getByText(/MC01/)).toBeVisible();
  await expect(page.getByText(/RES4CITY/).first()).toBeVisible();
  await expect(page.locator('img[alt*="banner"]')).toBeVisible();
  await expect(page.getByText(/Delivered by RES4CITY/)).toBeVisible();
});

test("programme detail shows title, organisation, about, and member credentials", async ({
  page,
}) => {
  await page.goto("/programs/advanced-design-of-sustainable-cities");
  await expect(
    page.getByRole("heading", { name: "Advanced Design of Sustainable Cities" }),
  ).toBeVisible();
  await expect(page.getByText(/RES4CITY/).first()).toBeVisible();
  await expect(page.getByText(/bundles several micro-credentials/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Efficient Building Techniques/ })).toBeVisible();
});

test("header logo and catalogue links work", async ({ page }) => {
  await page.goto("/courses");
  await page.getByRole("link", { name: "BoostMySkills home" }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);
  // Catalogue dropdown (scoped to the primary nav) → Micro-programmes
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByText("Catalogue").click();
  await nav.getByRole("link", { name: "Micro-programmes" }).click();
  await expect(page).toHaveURL(/\/programs$/);
});

test("footer company/contact links work", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "About us" }).click();
  await expect(page).toHaveURL(/\/about$/);
});

test("footer policy links resolve (including aliases)", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Cookie Policy" }).click();
  await expect(page).toHaveURL(/\/cookie_policy$/);
  await page.goto("/");
  await footer.getByRole("link", { name: "Terms and Conditions" }).click();
  await expect(page).toHaveURL(/\/tos$/);
});

test("mobile menu opens, navigates and closes on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const panel = page.getByRole("menu");
  await expect(panel.getByRole("menuitem", { name: "Micro-programmes" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { productAdminActor, runId } from "./global-setup";
import { all, closeDb, count, db, one } from "./_db";
import { makePng } from "../helpers/images";

/**
 * ACTUAL PRODUCT VERTICAL — TEST-AUTH-BACKED (not Clerk-backed).
 *
 * Drives the real admin→learner credential-to-certificate journey through the
 * browser: the actual UI, route handlers, server actions, PostgreSQL and the
 * local storage provider. Service calls are used ONLY for (a) DB verification
 * after UI actions and (b) reading this run's uniquely-marked records. Every
 * record created here embeds the per-run marker E2E_RUN_ID so cleanup only ever
 * touches this run. Real Clerk session automation remains a separate follow-up.
 */

const SECRET = process.env.TEST_AUTH_SECRET ?? "";
const RUN = runId();
const U = RUN.toUpperCase();

const ADMIN = productAdminActor();
const LEARNER = {
  clerkUserId: `e2e_prod_learner_${RUN}`,
  email: `e2e-prod-learner-${RUN}@example.test`,
  username: `prodlearner${RUN}`,
  firstName: "Prod",
  lastName: "Learner",
};
const LEARNER2 = {
  clerkUserId: `e2e_prod_learner2_${RUN}`,
  email: `e2e-prod-learner2-${RUN}@example.test`,
  username: `prodlearner2${RUN}`,
  firstName: "Other",
  lastName: "Learner",
};

// Unique authoring data for this run.
const PROJECT_NAME = `UAT Project ${U}`;
const PROJECT_SLUG = `uat-project-${RUN}`;
const ORG = `UAT Org ${U}`;
const ISSUER = `UAT Issuer ${U}`;
const SIGNATORY = "Jane Signatory";
const SIGNATORY_ROLE = "Programme Director";
const CRED_A = { code: `MCA${U}`, slug: `uat-cred-a-${RUN}`, title: `UAT Credential A ${U}` };
const CRED_B = { code: `MCB${U}`, slug: `uat-cred-b-${RUN}`, title: `UAT Credential B ${U}` };
const PROG = { title: `UAT Programme ${U}`, slug: `uat-prog-${RUN}` };

// A real, fully-decodable 160×90 PNG (valid IHDR + IDAT + IEND) — decodes in the
// browser with naturalWidth/Height > 0 and passes structural banner validation.
const PNG_BYTES = makePng(160, 90);

function headersFor(actor: Record<string, unknown> | null): Record<string, string> {
  if (!actor) return {};
  return { "x-test-auth-secret": SECRET, "x-test-actor": JSON.stringify(actor) };
}

// Shared state carried across the serial journey.
const S: {
  admin?: BrowserContext;
  adminPage?: Page;
  learner?: BrowserContext;
  learnerPage?: Page;
  learner2?: BrowserContext;
  learner2Page?: Page;
  anon?: BrowserContext;
  anonPage?: Page;
  projectId?: string;
  credAId?: string;
  credBId?: string;
  progId?: string;
  learnerUserId?: string;
  credAEnrolmentId?: string;
  credBEnrolmentId?: string;
  verificationCode?: string;
  // hide/unhide memory
  memory?: Record<string, unknown>;
} = {};

async function ctx(
  browser: Browser,
  actor: Record<string, unknown> | null,
): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({ extraHTTPHeaders: headersFor(actor) });
  const page = await context.newPage();
  return [context, page];
}

/** Author one credential's content through the visual builder (already on its [id] page). */
async function authorCredential(
  page: Page,
  opts: { withVideo: boolean; threshold?: number; requireReading?: boolean },
): Promise<void> {
  // Section
  await page.getByRole("button", { name: "+ Add section" }).click();
  await page.getByLabel("Section title").last().fill("Introduction");
  // Subsection 1: Welcome
  await page.getByRole("button", { name: "+ Add subsection" }).last().click();
  await page.getByLabel("Subsection title").last().fill("Welcome");
  // Reading unit
  await page.getByRole("button", { name: "+ READING" }).last().click();
  await page.getByLabel("Unit title").last().fill("Introduction reading");
  await page
    .getByLabel("Reading content (HTML)")
    .last()
    .fill("<p>Welcome to this micro-credential. Read carefully.</p>");
  if (opts.withVideo) {
    await page.getByRole("button", { name: "+ VIDEO" }).last().click();
    await page.getByLabel("Unit title").last().fill("Introduction video");
    await page.getByLabel("YouTube URL or ID").last().fill("dQw4w9WgXcQ");
  }
  // Subsection 2: Knowledge Check
  await page.getByRole("button", { name: "+ Add subsection" }).last().click();
  await page.getByLabel("Subsection title").last().fill("Knowledge Check");
  // MCQ unit
  await page.getByRole("button", { name: "+ MCQ" }).last().click();
  await page.getByLabel("Unit title").last().fill("Knowledge check quiz");
  // Units default to required:true in the builder (required-unit behaviour) — asserted
  // from the persisted content_document after save; no toggle needed here.
  await page
    .getByLabel(/Pass mark/)
    .last()
    .fill("50");

  // Question 1 — NEUTRAL option labels (no "(correct)"/"(wrong)" hints). Correctness
  // is configured ONLY through the admin grading checkbox, never the visible text.
  const q1 = page.locator("fieldset", { hasText: "Question 1" });
  await q1.getByLabel("Question text").fill("What is 2 + 2?");
  await q1.getByRole("button", { name: "+ option" }).click(); // → 3 options
  const q1opts = q1.getByLabel("Option text");
  await q1opts.nth(0).fill("4");
  await q1opts.nth(1).fill("5");
  await q1opts.nth(2).fill("6");
  await q1.getByLabel("Correct answer").nth(0).check(); // "4" is correct (grading only)

  // Question 2
  await page.getByRole("button", { name: "+ Add question" }).last().click();
  const q2 = page.locator("fieldset", { hasText: "Question 2" });
  await q2.getByLabel("Question text").fill("Capital of France?");
  await q2.getByRole("button", { name: "+ option" }).click();
  const q2opts = q2.getByLabel("Option text");
  await q2opts.nth(0).fill("Paris");
  await q2opts.nth(1).fill("Rome");
  await q2opts.nth(2).fill("Berlin");
  await q2.getByLabel("Correct answer").nth(0).check(); // "Paris" is correct (grading only)

  // Certification threshold (set explicitly; default 50)
  await page.getByLabel(/Threshold/).fill(String(opts.threshold ?? 50));
  // Require the Reading unit for certification (enables the §6 "MCQ first, required
  // Reading later" issuance path). Only for the credential that carries a video/reading.
  if (opts.requireReading) {
    await page.getByLabel('Require "Introduction reading" for certification').check();
  }

  // Save the draft (waits for the server round-trip), then confirm readiness.
  await clickSaveDraft(page);
  await expect(page.getByText("✓ ready to publish")).toBeVisible();
}

/** Click "Save draft" and wait for the server action POST to actually commit. */
async function clickSaveDraft(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/admin/credentials/"),
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Save draft" }).click(),
  ]);
  await expect(page.getByText("Draft saved.")).toBeVisible();
}

/** Open a unit in the one-unit-per-page player via its sidebar link (the current
 * unit's title becomes the page h1). */
async function openUnit(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** Navigate to a non-MCQ unit and mark it complete; assert the completed state. */
async function markUnitComplete(page: Page, title: string): Promise<void> {
  await openUnit(page, title);
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText(/Completed/)).toBeVisible();
}

/** The player progress line, e.g. "33% · 1 of 3 units". */
function progressLabel(page: Page) {
  return page.locator(".player-progress__label");
}

/**
 * Navigate to the MCQ unit, answer both questions correctly and submit. The
 * action revalidates, so the unit locks and shows the score — we assert that
 * server-rendered locked state.
 */
async function passMcq(page: Page): Promise<void> {
  await openUnit(page, "Knowledge check quiz");
  // Answer-secrecy: the learner response must not serialise any internal answer key,
  // and no option may carry a correctness marker before submission.
  const html = await page.content();
  for (const leak of [
    "correctOptionIds",
    "grading_document",
    "gradingDocument",
    "grading_snapshot",
  ]) {
    expect(html, `learner response must not contain ${leak}`).not.toContain(leak);
  }
  expect(await page.locator("[data-correct], [data-correct-option]").count()).toBe(0);
  // Select the intended answers by their NEUTRAL labels, scoped to each question —
  // the test knows these are correct from authoring, not from the visible text.
  await page
    .locator("fieldset", { hasText: "What is 2 + 2?" })
    .getByText("4", { exact: true })
    .click();
  await page
    .locator("fieldset", { hasText: "Capital of France?" })
    .getByText("Paris", { exact: true })
    .click();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText(/Assessment submitted/)).toBeVisible();
  await expect(page.getByText(/score 100%/)).toBeVisible();
}

async function uploadBanner(page: Page, buttonName: string, successText: string): Promise<void> {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: `banner-${RUN}.png`, mimeType: "image/png", buffer: PNG_BYTES });
  await page.getByRole("button", { name: buttonName }).click();
  await expect(page.getByText(successText)).toBeVisible();
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("actual product vertical (test-auth)", () => {
  test.beforeAll(async ({ browser }) => {
    expect(SECRET, "TEST_AUTH_SECRET must be injected by run-auth-e2e.mts").not.toBe("");
    [S.admin, S.adminPage] = await ctx(browser, ADMIN);
    [S.learner, S.learnerPage] = await ctx(browser, LEARNER);
    [S.learner2, S.learner2Page] = await ctx(browser, LEARNER2);
    [S.anon, S.anonPage] = await ctx(browser, null);
  });

  test.afterAll(async () => {
    // Safety: always leave maintenance off, even if a test failed.
    try {
      await db().query(`UPDATE platform_settings SET maintenance_mode = false WHERE id = 1`);
    } catch {
      /* ignore */
    }
    await S.admin?.close();
    await S.learner?.close();
    await S.learner2?.close();
    await S.anon?.close();
    await closeDb();
  });

  // ============================ §5 ADMIN: PROJECT + CREDENTIAL A ============================
  test("admin creates Credential A with inline Project (issuer + signatory)", async () => {
    const page = S.adminPage!;
    await page.goto("/admin/credentials");
    await expect(page.getByRole("heading", { name: "Micro-credentials" })).toBeVisible();

    // Inline project creation from the credential workflow.
    const inline = page.getByLabel("Create a new project inline");
    if (!(await inline.isChecked())) await inline.check();
    await page.getByPlaceholder("New project name").fill(PROJECT_NAME);
    await page.getByPlaceholder("New project slug").fill(PROJECT_SLUG);
    await page.getByPlaceholder("Certificate issuer name (optional)").fill(ISSUER);
    await page.getByPlaceholder("Certificate signatory name (optional)").fill(SIGNATORY);
    await page.getByPlaceholder("Certificate signatory role (optional)").fill(SIGNATORY_ROLE);
    await page.getByPlaceholder("Code (e.g. MC36)").fill(CRED_A.code);
    await page.getByPlaceholder("slug", { exact: true }).fill(CRED_A.slug);
    await page.getByPlaceholder("Title", { exact: true }).fill(CRED_A.title);
    await page.getByPlaceholder("Author name").fill("UAT Author");
    // Organisation is now captured per micro-credential (required), not on the project.
    await page.getByPlaceholder("Organisation (delivering university/partner)").fill(ORG);
    await page
      .getByPlaceholder("Short description (optional)")
      .fill("Credential A short description");
    await page
      .getByPlaceholder("About / context (optional, sanitised)")
      .fill("<p>About credential A context.</p>");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("Credential draft created.")).toBeVisible();

    // Verify DB: project + credential + template with issuer/signatory.
    const proj = await one<{ id: string; certificate_template: Record<string, unknown> }>(
      `SELECT id, certificate_template FROM projects WHERE slug = $1`,
      [PROJECT_SLUG],
    );
    expect(proj).toBeTruthy();
    S.projectId = proj!.id;
    expect(proj!.certificate_template.issuerName).toBe(ISSUER);
    expect(proj!.certificate_template.signatoryName).toBe(SIGNATORY);
    expect(proj!.certificate_template.signatoryRole).toBe(SIGNATORY_ROLE);

    const cred = await one<{ id: string }>(`SELECT id FROM micro_credentials WHERE code = $1`, [
      CRED_A.code,
    ]);
    expect(cred).toBeTruthy();
    S.credAId = cred!.id;
  });

  test("admin authors Credential A in the visual builder (no raw JSON)", async () => {
    const page = S.adminPage!;
    await page.goto(`/admin/credentials/${S.credAId}`);
    await expect(page.getByRole("heading", { name: CRED_A.code })).toBeVisible();
    await authorCredential(page, { withVideo: true, requireReading: true });

    // Content persisted: stable IDs exist; NO correct answers in learner content.
    const draft = await one<{ content_document: { sections: unknown[] } }>(
      `SELECT cv.content_document
         FROM credential_versions cv
        WHERE cv.credential_id = $1 AND cv.status = 'draft'`,
      [S.credAId],
    );
    const contentJson = JSON.stringify(draft!.content_document);
    expect(draft!.content_document.sections.length).toBe(1);
    expect(contentJson).toMatch(/"id":\s*"s/); // stable section id
    expect(contentJson).not.toContain("correctOptionIds");
    expect(contentJson).toContain('"required":true'); // required-unit behaviour persisted
    // Grading holds the answers, content does not.
    const grading = await one<{ grading_document: unknown }>(
      `SELECT cv.grading_document FROM credential_versions cv
        WHERE cv.credential_id = $1 AND cv.status = 'draft'`,
      [S.credAId],
    );
    expect(JSON.stringify(grading!.grading_document)).toContain("correctOptionIds");
  });

  test("admin reorders a unit via the UI without changing stable IDs", async () => {
    const page = S.adminPage!;
    // Capture unit IDs + order before.
    const before = await one<{ content_document: unknown }>(
      `SELECT content_document FROM credential_versions WHERE credential_id = $1 AND status='draft'`,
      [S.credAId],
    );
    const idsBefore = unitIds(before!.content_document);
    // Move the reading unit down within its subsection (Reading↔Video swap).
    await page.getByRole("button", { name: "Move unit down" }).first().click();
    await clickSaveDraft(page);
    const after = await one<{ content_document: unknown }>(
      `SELECT content_document FROM credential_versions WHERE credential_id = $1 AND status='draft'`,
      [S.credAId],
    );
    const idsAfter = unitIds(after!.content_document);
    expect(idsAfter).not.toEqual(idsBefore); // order changed
    expect([...idsAfter].sort()).toEqual([...idsBefore].sort()); // same IDs, reordered
  });

  test("admin uploads Credential A banner (logical key, no absolute path)", async () => {
    const page = S.adminPage!;
    await uploadBanner(page, "Upload banner to draft", "Banner uploaded to draft.");
    const row = await one<{ banner_object_key: string | null }>(
      `SELECT banner_object_key FROM credential_versions WHERE credential_id=$1 AND status='draft'`,
      [S.credAId],
    );
    expect(row!.banner_object_key).toBeTruthy();
    expect(row!.banner_object_key!).not.toMatch(/^([a-zA-Z]:[\\/]|\/|file:)/);
    expect(row!.banner_object_key!).not.toContain("\\");
    // §8 — draft media is admin-only.
    const draftKey = row!.banner_object_key!;
    expect((await S.adminPage!.request.get(`/media/${draftKey}`)).status()).toBe(200);
    expect([401, 403, 404]).toContain(
      (await S.anonPage!.request.get(`/media/${draftKey}`)).status(),
    );
    // Draft is absent from the public catalogue.
    await S.anonPage!.goto("/courses");
    await expect(S.anonPage!.getByRole("link", { name: new RegExp(CRED_A.title) })).toHaveCount(0);
  });

  test("admin publishes Credential A; it appears publicly with no grading leak", async () => {
    const page = S.adminPage!;
    await page.getByRole("button", { name: "Publish changes" }).click();
    await expect(page.getByText("Published.")).toBeVisible();
    expect(
      await one(`SELECT 1 FROM micro_credentials WHERE id=$1 AND status='published'`, [S.credAId]),
    ).toBeTruthy();

    // Public catalogue + detail.
    await S.anonPage!.goto("/courses");
    await expect(S.anonPage!.getByRole("link", { name: new RegExp(CRED_A.title) })).toBeVisible();
    await S.anonPage!.goto(`/courses/${CRED_A.slug}`);
    await expect(S.anonPage!.getByRole("heading", { name: CRED_A.title })).toBeVisible();
    await expect(S.anonPage!.getByText(`by ${ORG}`)).toBeVisible();
    await expect(S.anonPage!.getByText("About credential A context.")).toBeVisible();

    // §8 — published banner is public, correct content type, and a REAL decodable image.
    const pubKey = (await one<{ banner_object_key: string }>(
      `SELECT banner_object_key FROM credential_versions WHERE credential_id=$1 AND status='published'`,
      [S.credAId],
    ))!.banner_object_key;
    const media = await S.anonPage!.request.get(`/media/${pubKey}`);
    expect(media.status()).toBe(200);
    expect(media.headers()["content-type"]).toContain("image/png");
    const img = S.anonPage!.locator(`img[alt="${CRED_A.title} banner"]`);
    await expect(img).toBeVisible();
    await expect
      .poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalHeight))
      .toBeGreaterThan(0);

    // Learner-facing HTML must not contain grading answers.
    const html = await S.anonPage!.content();
    expect(html).not.toContain("correctOptionIds");
  });

  // ============================ §6 ADMIN: CREDENTIAL B + PROGRAMME ============================
  test("admin creates + authors + publishes Credential B (same project)", async () => {
    const page = S.adminPage!;
    await page.goto("/admin/credentials");
    // Same project → use the select, not inline.
    const inline = page.getByLabel("Create a new project inline");
    if (await inline.isChecked()) await inline.uncheck();
    await page.locator('select[name="projectId"]').selectOption({ label: PROJECT_NAME });
    await page.getByPlaceholder("Code (e.g. MC36)").fill(CRED_B.code);
    await page.getByPlaceholder("slug", { exact: true }).fill(CRED_B.slug);
    await page.getByPlaceholder("Title", { exact: true }).fill(CRED_B.title);
    await page.getByPlaceholder("Author name").fill("UAT Author");
    // Organisation is required per micro-credential (same as Credential A).
    await page.getByPlaceholder("Organisation (delivering university/partner)").fill(ORG);
    await page
      .getByPlaceholder("Short description (optional)")
      .fill("Credential B short description");
    await page
      .getByPlaceholder("About / context (optional, sanitised)")
      .fill("<p>About credential B context.</p>");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("Credential draft created.")).toBeVisible();
    const cred = await one<{ id: string }>(`SELECT id FROM micro_credentials WHERE code=$1`, [
      CRED_B.code,
    ]);
    S.credBId = cred!.id;

    await page.goto(`/admin/credentials/${S.credBId}`);
    // Threshold 100 so that partial completion in §10 does not auto-issue a B
    // certificate (keeps exactly one certificate — for Credential A — in this run).
    await authorCredential(page, { withVideo: false, threshold: 100 });
    await uploadBanner(page, "Upload banner to draft", "Banner uploaded to draft.");
    await page.getByRole("button", { name: "Publish changes" }).click();
    await expect(page.getByText("Published.")).toBeVisible();
    expect(
      await one(`SELECT 1 FROM micro_credentials WHERE id=$1 AND status='published'`, [S.credBId]),
    ).toBeTruthy();
  });

  test("admin creates a Programme, adds both credentials, prevents duplicates, publishes", async () => {
    const page = S.adminPage!;
    await page.goto("/admin/programmes");
    await page.locator('select[name="projectId"]').selectOption({ label: PROJECT_NAME });
    await page.getByPlaceholder("Title").fill(PROG.title);
    await page.getByPlaceholder("slug").fill(PROG.slug);
    // Organisation is required on the programme too.
    await page.getByPlaceholder("Organisation (delivering partner)").fill(ORG);
    await page
      .getByPlaceholder("Short description (optional)")
      .fill("UAT programme short description");
    await page
      .getByPlaceholder("About / context (optional, sanitised)")
      .fill("<p>About the UAT programme.</p>");
    await page.getByRole("button", { name: "Create programme" }).click();
    await expect(page.getByText("Programme created.")).toBeVisible();
    const prog = await one<{ id: string }>(`SELECT id FROM micro_programmes WHERE slug=$1`, [
      PROG.slug,
    ]);
    S.progId = prog!.id;

    await page.goto(`/admin/programmes/${S.progId}`);
    await expect(page.getByRole("heading", { name: PROG.title })).toBeVisible();

    // Upload programme banner.
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: `prog-${RUN}.png`, mimeType: "image/png", buffer: PNG_BYTES });
    await page.getByRole("button", { name: "Upload banner" }).click();
    await expect(page.getByText("Banner uploaded.")).toBeVisible();

    // Add both member credentials.
    const addSel = page.getByLabel("Add credential");
    await addSel.selectOption({ label: `${CRED_A.code} — ${CRED_A.title}` });
    await addSel.selectOption({ label: `${CRED_B.code} — ${CRED_B.title}` });
    // Duplicate prevention: once added, a credential is no longer an option.
    await expect(
      addSel.locator("option", { hasText: `${CRED_A.code} — ${CRED_A.title}` }),
    ).toHaveCount(0);
    // Reorder (move the 2nd up then back) and set required on the first member.
    await page.getByRole("button", { name: "Move up" }).last().click();
    await page.getByRole("button", { name: "Move down" }).first().click();
    await page.getByLabel("required").first().check();
    await page.getByRole("button", { name: "Save membership" }).click();
    await expect(page.getByText("Membership updated.")).toBeVisible();

    // Draft programme must not be public yet.
    await S.anonPage!.goto("/programs");
    await expect(S.anonPage!.getByRole("link", { name: new RegExp(PROG.title) })).toHaveCount(0);

    // Publish.
    await page.getByRole("button", { name: "Publish programme" }).click();
    await expect(page.getByText("Programme published.")).toBeVisible();

    // Public programme detail: banner, title, org, about, ordered credentials.
    await S.anonPage!.goto(`/programs/${PROG.slug}`);
    await expect(S.anonPage!.getByRole("heading", { name: PROG.title })).toBeVisible();
    await expect(S.anonPage!.locator(`img[alt="${PROG.title} banner"]`)).toBeVisible();
    await expect(S.anonPage!.getByText("About the UAT programme.")).toBeVisible();
    const links = S.anonPage!.locator("ol a");
    await expect(links).toHaveCount(2);
    // Membership order is contiguous 1,2 in the DB.
    const positions = await all<{ position: number }>(
      `SELECT position FROM programme_credentials WHERE programme_id=$1 ORDER BY position`,
      [S.progId],
    );
    expect(positions.length).toBe(2);
    expect(positions[1]!.position - positions[0]!.position).toBe(1); // contiguous
  });

  // ============================ §7 LEARNER: DIRECT ENROLMENT ============================
  test("learner enrols in Credential A via the UI (idempotent, one enrolment)", async () => {
    const page = S.learnerPage!;
    await page.goto(`/courses/${CRED_A.slug}`);
    await page.getByRole("button", { name: "Enrol" }).click();
    // Success flips the control to the enrolled state (the new UI shows no toast).
    await expect(page.getByRole("button", { name: "Enrolled" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to course/ })).toBeVisible();

    S.learnerUserId = (await one<{ id: string }>(
      `SELECT id FROM app_users WHERE clerk_user_id=$1`,
      [LEARNER.clerkUserId],
    ))!.id;

    // Access the learning structure (one-unit-per-page: the sidebar lists every unit
    // of the section, and one lesson opens by default).
    await page.goto(`/learn/${S.credAId}`);
    for (const t of ["Introduction reading", "Introduction video", "Knowledge check quiz"]) {
      await expect(page.getByRole("link", { name: t, exact: true })).toBeVisible();
    }
    await expect(page.locator(".player__section-title", { hasText: "Introduction" })).toBeVisible();

    // Idempotent: reloading the detail page keeps the enrolled state (the server
    // action de-dupes; the UI offers no second "Enrol" button), and the DB below
    // confirms exactly one enrolment row.
    await page.goto(`/courses/${CRED_A.slug}`);
    await expect(page.getByRole("button", { name: "Enrolled" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enrol", exact: true })).toHaveCount(0);

    const enr = await all<{ id: string; status: string }>(
      `SELECT e.id, cv.status FROM enrollments e
         JOIN credential_versions cv ON cv.id = e.credential_version_id
        WHERE e.user_id=$1 AND e.credential_id=$2`,
      [S.learnerUserId, S.credAId],
    );
    expect(enr.length).toBe(1);
    expect(enr[0]!.status).toBe("published");
    S.credAEnrolmentId = enr[0]!.id;
  });

  // ============================ §8 LEARNER: PROGRAMME REGISTRATION ============================
  test("learner registers for the Programme; fan-out reuses A and creates B", async () => {
    const page = S.learnerPage!;
    await page.goto(`/programs/${PROG.slug}`);
    await page.getByRole("button", { name: "Register for programme" }).click();
    // Success flips the control to the registered state (no toast in the new UI).
    await expect(page.getByRole("button", { name: "Registered" })).toBeVisible();

    const progEnr = await all<{ id: string; metadata: unknown }>(
      `SELECT id, metadata FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [S.learnerUserId, S.progId],
    );
    expect(progEnr.length).toBe(1);

    // A reused (still exactly 1), B created.
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND credential_id=$2`, [
        S.learnerUserId,
        S.credAId,
      ]),
    ).toBe(1);
    const bEnr = await all<{ id: string }>(
      `SELECT id FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
      [S.learnerUserId, S.credBId],
    );
    expect(bEnr.length).toBe(1);
    S.credBEnrolmentId = bEnr[0]!.id;

    // Snapshot contains both credential IDs, both enrolment IDs (A reused).
    const snap = JSON.stringify(progEnr[0]!.metadata);
    expect(snap).toContain(S.credAId!);
    expect(snap).toContain(S.credBId!);
    expect(snap).toContain(S.credAEnrolmentId!);
    expect(snap).toContain(S.credBEnrolmentId!);

    // Idempotent: the detail page keeps the registered state on reload (the server
    // action de-dupes; the UI offers no second "Register" button) — no new rows.
    await page.goto(`/programs/${PROG.slug}`);
    await expect(page.getByRole("button", { name: "Registered" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Register for programme" }),
    ).toHaveCount(0);
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND programme_id=$2`, [
        S.learnerUserId,
        S.progId,
      ]),
    ).toBe(1);
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND credential_id=$2`, [
        S.learnerUserId,
        S.credAId,
      ]),
    ).toBe(1);
  });

  // ===== §9 PLAYER + §3 HIERARCHY STATUS + §6 ISSUANCE TRANSITION + §7 ANSWER SECRECY =====
  const certCount = () =>
    count(`SELECT 1 FROM certificates WHERE enrollment_id=$1`, [S.credAEnrolmentId]);

  test("player renders every type; hierarchy status updates; MCQ-then-required-reading issues cert", async () => {
    const page = S.learnerPage!;
    await page.goto(`/learn/${S.credAId}`);
    // One-unit-per-page: after the earlier reorder the video is the first lesson and
    // opens by default; the sidebar lists all three units.
    await expect(
      page.getByRole("heading", { level: 1, name: "Introduction video" }),
    ).toBeVisible();
    for (const t of ["Introduction reading", "Introduction video", "Knowledge check quiz"]) {
      await expect(page.getByRole("link", { name: t, exact: true })).toBeVisible();
    }
    // §3.1 — initially nothing complete.
    await expect(progressLabel(page)).toHaveText(/0%\s*·\s*0 of 3 units/);

    // Each supported unit type renders when opened — the video embeds its player.
    await openUnit(page, "Introduction video");
    await expect(page.locator('iframe[title="video"]')).toBeVisible();

    // §6 + §7 — pass the MCQ FIRST (neutral labels, answer-secrecy asserted in passMcq).
    // The Reading is required for certification, so no certificate is issued yet.
    await passMcq(page);
    expect(await certCount()).toBe(0);

    // §3.2/§3.3 — completing that one unit advances overall progress to 1 of 3.
    await page.goto(`/learn/${S.credAId}`);
    await expect(progressLabel(page)).toHaveText(/33%\s*·\s*1 of 3 units/);
    // one-attempt policy: the quiz is locked, with no resubmit control.
    await openUnit(page, "Knowledge check quiz");
    await expect(page.getByRole("button", { name: "Submit answers" })).toHaveCount(0);

    // Completing the video still does not certify (required reading outstanding).
    await markUnitComplete(page, "Introduction video");
    expect(await certCount()).toBe(0);

    // §6 — completing the REQUIRED reading LAST triggers issuance on that progress action.
    await markUnitComplete(page, "Introduction reading");
    expect(await certCount()).toBe(1);

    // §3.4/§3.5 — reload preserves 100% and surfaces the issued-certificate banner.
    await page.reload();
    await expect(progressLabel(page)).toHaveText(/100%\s*·\s*3 of 3 units/);
    await expect(page.getByText(/certificate issued/i)).toBeVisible();

    // Exactly one attempt, passed; grading snapshot lives in the DB only.
    const att = await all<{ passed: boolean; percentage: string; grading_snapshot: unknown }>(
      `SELECT passed, percentage, grading_snapshot FROM assessment_attempts WHERE enrollment_id=$1`,
      [S.credAEnrolmentId],
    );
    expect(att.length).toBe(1);
    expect(att[0]!.passed).toBe(true);
    expect(Number(att[0]!.percentage)).toBe(100);
    expect(JSON.stringify(att[0]!.grading_snapshot)).toContain("correctOptionIds");

    // Credential overall progress is shown on the dashboard.
    await page.goto("/dashboard");
    await expect(
      page
        .locator(".dash-card")
        .filter({ hasText: CRED_A.code })
        .getByText(/100% complete/),
    ).toBeVisible();
  });

  // ============================ §11 CERTIFICATE ============================
  test("certificate issues once, owner downloads PDF, public verify leaks nothing", async () => {
    const cert = await all<{
      verification_code: string;
      certificate_snapshot: unknown;
      status: string;
    }>(
      `SELECT verification_code, certificate_snapshot, status FROM certificates WHERE enrollment_id=$1`,
      [S.credAEnrolmentId],
    );
    expect(cert.length).toBe(1); // issued once, not duplicated
    S.verificationCode = cert[0]!.verification_code;
    expect(JSON.stringify(cert[0]!.certificate_snapshot)).toContain(ISSUER);

    const page = S.learnerPage!;
    await page.goto("/account/certificates");
    await expect(page.getByRole("heading", { name: new RegExp(CRED_A.code) })).toBeVisible();

    // Owner downloads the PDF via the UI route (context carries the learner identity).
    const dl = await page.request.get(`/account/certificates/${S.verificationCode}/download`);
    expect(dl.status()).toBe(200);
    expect((await dl.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Anonymous + another learner are denied.
    const anonDl = await S.anonPage!.request.get(
      `/account/certificates/${S.verificationCode}/download`,
    );
    expect(anonDl.status()).toBe(401);
    const l2Dl = await S.learner2Page!.request.get(
      `/account/certificates/${S.verificationCode}/download`,
    );
    expect([403, 404]).toContain(l2Dl.status());

    // Public verification succeeds and exposes only approved fields.
    await S.anonPage!.goto(`/certificates/${S.verificationCode}`);
    await expect(S.anonPage!.getByText(/VALID/)).toBeVisible();
    const vhtml = await S.anonPage!.content();
    for (const secret of [
      LEARNER.email,
      LEARNER.clerkUserId,
      S.learnerUserId!,
      S.credAEnrolmentId!,
      "correctOptionIds",
    ]) {
      expect(vhtml).not.toContain(secret);
    }
  });

  // ============================ §10 PROGRAMME PROGRESS ============================
  test("Credential B partial completion; programme aggregate shows on the dashboard (§4)", async () => {
    const page = S.learnerPage!;
    await page.goto(`/learn/${S.credBId}`);
    await markUnitComplete(page, "Introduction reading"); // 1 of B's 2 units → 50%
    await page.goto("/dashboard");

    // Per-credential cards (scoped by their own heading, not the programme card).
    const aCard = page.locator(".dash-card").filter({
      has: page.getByRole("heading", { level: 3, name: CRED_A.title }),
    });
    const bCard = page.locator(".dash-card").filter({
      has: page.getByRole("heading", { level: 3, name: CRED_B.title }),
    });
    await expect(aCard.getByText(/100% complete/)).toBeVisible();
    await expect(bCard.getByText(/50% complete/)).toBeVisible();

    // §4 — programme aggregate card: mean(A 100, B 50) = 75%, 1 of 2 completed, members shown.
    const progCard = page.locator(".dash-prog").filter({
      has: page.getByRole("heading", { level: 3, name: PROG.title }),
    });
    await expect(
      progCard.getByLabel(/Programme progress: 75% complete, 1 of 2 credentials completed/),
    ).toBeVisible();
    await expect(progCard.locator(".dash-member", { hasText: CRED_A.code })).toContainText("100%");
    await expect(progCard.locator(".dash-member", { hasText: CRED_B.code })).toContainText("50%");

    // Shared Credential A counted once (single enrolment across direct + programme).
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND credential_id=$2`, [
        S.learnerUserId,
        S.credAId,
      ]),
    ).toBe(1);
  });

  // ============================ §12 CREDENTIAL HIDE / UNHIDE ============================
  test("credential hide blocks learner/anon but preserves history; unhide restores", async () => {
    // Record history BEFORE hiding.
    const enrol = (await one<{ credential_version_id: string }>(
      `SELECT credential_version_id FROM enrollments WHERE id=$1`,
      [S.credAEnrolmentId],
    ))!;
    const att = (await one<{ id: string; percentage: string }>(
      `SELECT id, percentage FROM assessment_attempts WHERE enrollment_id=$1`,
      [S.credAEnrolmentId],
    ))!;
    const cert = (await one<{ id: string }>(`SELECT id FROM certificates WHERE enrollment_id=$1`, [
      S.credAEnrolmentId,
    ]))!;
    const progressCount = await count(
      `SELECT 1 FROM unit_progress WHERE enrollment_id=$1 AND status='completed'`,
      [S.credAEnrolmentId],
    );
    S.memory = {
      versionId: enrol.credential_version_id,
      attemptId: att.id,
      certId: cert.id,
      progressCount,
    };

    // Admin hides Credential A through the UI.
    await S.adminPage!.goto(`/admin/credentials/${S.credAId}`);
    await S.adminPage!.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(S.adminPage!.getByText("Hidden.")).toBeVisible();

    // Public + learner access blocked.
    await S.anonPage!.goto("/courses");
    await expect(S.anonPage!.getByRole("link", { name: new RegExp(CRED_A.title) })).toHaveCount(0);
    expect((await S.anonPage!.goto(`/courses/${CRED_A.slug}`))!.status()).toBe(404);
    expect((await S.learnerPage!.goto(`/learn/${S.credAId}`))!.status()).toBe(404); // bookmarked URL blocked
    // A different learner cannot reach the detail to enrol.
    expect((await S.learner2Page!.goto(`/courses/${CRED_A.slug}`))!.status()).toBe(404);

    // Dashboard shows Temporarily unavailable and no Resume link (credential card,
    // scoped by its own heading so the programme card's member row is not matched).
    await S.learnerPage!.goto("/dashboard");
    const aCard = S.learnerPage!.locator(".dash-card").filter({
      has: S.learnerPage!.getByRole("heading", { level: 3, name: CRED_A.title }),
    });
    await expect(aCard.getByText("Temporarily unavailable", { exact: true })).toBeVisible();
    await expect(aCard.getByRole("link", { name: /Resume|Start|Review/ })).toHaveCount(0);

    // Admin can still open it.
    await S.adminPage!.goto(`/admin/credentials/${S.credAId}`);
    await expect(S.adminPage!.getByRole("heading", { name: CRED_A.code })).toBeVisible();

    // Certificate remains downloadable + publicly verifiable while hidden.
    const dl = await S.learnerPage!.request.get(
      `/account/certificates/${S.verificationCode}/download`,
    );
    expect(dl.status()).toBe(200);
    await S.anonPage!.goto(`/certificates/${S.verificationCode}`);
    await expect(S.anonPage!.getByText(/VALID/)).toBeVisible();

    // Stored history is unchanged.
    expect(
      (await one(`SELECT 1 FROM assessment_attempts WHERE id=$1 AND percentage=$2`, [
        att.id,
        att.percentage,
      ])) !== undefined,
    ).toBe(true);
    expect(
      await count(`SELECT 1 FROM unit_progress WHERE enrollment_id=$1 AND status='completed'`, [
        S.credAEnrolmentId,
      ]),
    ).toBe(progressCount);

    // Unhide → restores, same history, learner can resume.
    await S.adminPage!.getByRole("button", { name: "Unhide", exact: true }).click();
    await expect(S.adminPage!.getByText("Unhidden.")).toBeVisible();
    const after = (await one<{ credential_version_id: string }>(
      `SELECT credential_version_id FROM enrollments WHERE id=$1`,
      [S.credAEnrolmentId],
    ))!;
    expect(after.credential_version_id).toBe(S.memory.versionId);
    expect(await count(`SELECT 1 FROM certificates WHERE id=$1`, [cert.id])).toBe(1);
    await S.learnerPage!.goto("/dashboard");
    await expect(
      S.learnerPage!.locator(".dash-card")
        .filter({ has: S.learnerPage!.getByRole("heading", { level: 3, name: CRED_A.title }) })
        .getByRole("link", { name: /Resume|Start|Review/ }),
    ).toBeVisible();
  });

  // ============================ §13 PROGRAMME HIDE / UNHIDE ============================
  test("programme hide blocks catalogue/registration but preserves enrolment; unhide restores", async () => {
    const beforeProgEnrol = await count(
      `SELECT 1 FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [S.learnerUserId, S.progId],
    );
    const aStatus = (await one<{ status: string }>(
      `SELECT status FROM micro_credentials WHERE id=$1`,
      [S.credAId],
    ))!.status;

    await S.adminPage!.goto(`/admin/programmes/${S.progId}`);
    await S.adminPage!.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(S.adminPage!.getByText("Programme hidden.")).toBeVisible();

    await S.anonPage!.goto("/programs");
    await expect(S.anonPage!.getByRole("link", { name: new RegExp(PROG.title) })).toHaveCount(0);
    expect((await S.anonPage!.goto(`/programs/${PROG.slug}`))!.status()).toBe(404); // registration blocked

    // Existing programme enrolment + member credential statuses unchanged.
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND programme_id=$2`, [
        S.learnerUserId,
        S.progId,
      ]),
    ).toBe(beforeProgEnrol);
    expect(
      (await one<{ status: string }>(`SELECT status FROM micro_credentials WHERE id=$1`, [
        S.credAId,
      ]))!.status,
    ).toBe(aStatus);

    // §4 hidden-programme dashboard: the learner's programme card stays as read-only
    // "Temporarily unavailable" with no Open link, preserving the aggregate.
    await S.learnerPage!.goto("/dashboard");
    const progCard = S.learnerPage!.locator(".dash-prog").filter({
      has: S.learnerPage!.getByRole("heading", { level: 3, name: PROG.title }),
    });
    await expect(progCard.getByText("Temporarily unavailable", { exact: true })).toBeVisible();
    await expect(progCard.getByRole("link", { name: "Open programme" })).toHaveCount(0);
    await expect(progCard.getByLabel(/Programme progress: \d+% complete/)).toBeVisible(); // still shown

    // Unhide restores public detail + the Open link.
    await S.adminPage!.getByRole("button", { name: "Unhide", exact: true }).click();
    await expect(S.adminPage!.getByText("Programme unhidden.")).toBeVisible();
    expect((await S.anonPage!.goto(`/programs/${PROG.slug}`))!.status()).toBe(200);
    await S.learnerPage!.goto("/dashboard");
    await expect(
      S.learnerPage!.locator(".dash-prog")
        .filter({ has: S.learnerPage!.getByRole("heading", { level: 3, name: PROG.title }) })
        .getByRole("link", { name: "Open programme" }),
    ).toBeVisible();
  });

  // ============================ §14 MAINTENANCE MODE ============================
  test("maintenance mode gates non-admins server-side; home + admin stay open", async () => {
    await S.adminPage!.goto("/admin/maintenance");
    await S.adminPage!.getByRole("button", { name: "Enable maintenance" }).click();
    await expect(S.adminPage!.getByRole("button", { name: "Disable maintenance" })).toBeVisible();

    // Exactly one settings row.
    expect(await count(`SELECT 1 FROM platform_settings`)).toBe(1);
    // Home stays available to everyone; admin retains access.
    expect((await S.anonPage!.goto("/"))!.status()).toBe(200);
    expect((await S.adminPage!.goto("/admin"))!.status()).toBe(200);
    await expect(S.adminPage!.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
    // Non-admin learner + anon are redirected to /maintenance on gated routes (no bypass).
    await S.learnerPage!.goto("/dashboard");
    expect(S.learnerPage!.url()).toContain("/maintenance");
    await S.learnerPage!.goto(`/learn/${S.credAId}`);
    expect(S.learnerPage!.url()).toContain("/maintenance");
    await S.anonPage!.goto("/courses");
    expect(S.anonPage!.url()).toContain("/maintenance");

    // Disable → normal access resumes.
    await S.adminPage!.goto("/admin/maintenance");
    await S.adminPage!.getByRole("button", { name: "Disable maintenance" }).click();
    await expect(S.adminPage!.getByRole("button", { name: "Enable maintenance" })).toBeVisible();
    await S.learnerPage!.goto("/dashboard");
    expect(S.learnerPage!.url()).toContain("/dashboard");
  });

  // ============================ §15 ANALYTICS + CSV ============================
  test("admin analytics shows the learner; CSV export is safe and access-controlled", async () => {
    await S.adminPage!.goto("/admin/analytics");
    await expect(S.adminPage!.getByRole("heading", { name: "Enrolment analytics" })).toBeVisible();
    const row = S.adminPage!.locator("tr", { hasText: CRED_A.code });
    await expect(row.first()).toBeVisible();
    await expect(row.first().getByText("Prod Learner")).toBeVisible();

    // CSV export (filters live on the export endpoint query params — the app's design).
    const csvRes = await S.adminPage!.request.get(
      `/admin/analytics/export?credentialId=${S.credAId}`,
    );
    expect(csvRes.status()).toBe(200);
    expect(csvRes.headers()["content-type"]).toContain("csv");
    expect(csvRes.headers()["content-disposition"]).toContain("enrolment-analytics.csv");
    const csv = await csvRes.text();
    expect(csv.split("\r\n")[0]).toBe(
      "learner_name,organisation,project,credential_code,credential_title,progress_percent,completed,last_access,final_percentage,passed,enrolled_at",
    );
    expect(csv).toContain("Prod Learner");
    expect(csv).toContain(CRED_A.code);
    // No secrets in the export.
    for (const secret of [LEARNER.email, LEARNER.clerkUserId, "correctOptionIds"]) {
      expect(csv).not.toContain(secret);
    }
    // Learner + anon are denied the analytics export route server-side.
    expect((await S.learnerPage!.request.get("/admin/analytics/export")).status()).toBe(403);
    expect((await S.anonPage!.request.get("/admin/analytics/export")).status()).toBe(401);
  });

  // ============================ §16 OLX EXPORT + IMPORT VALIDATION ============================
  test("OLX export produces a safe archive; the import UI rejects a bad archive", async () => {
    // Export Credential A through the admin route.
    const exp = await S.adminPage!.request.get(`/admin/credentials/${S.credAId}/export`);
    expect(exp.status()).toBe(200);
    expect(exp.headers()["content-type"]).toContain("gzip");
    expect(exp.headers()["content-disposition"]).toContain(".tar.gz");
    const body = await exp.body();
    expect([body[0], body[1]]).toEqual([0x1f, 0x8b]); // gzip magic

    // The import UI rejects a non-archive upload (full archive-safety matrix — traversal/
    // symlink/size — is covered by olx-archive.test.ts, 14 real unit tests).
    await S.adminPage!.goto("/admin/imports");
    await S.adminPage!.locator('select[name="projectId"]').selectOption({ label: PROJECT_NAME });
    await S.adminPage!.locator('input[type="file"]').setInputFiles({
      name: `bogus-${RUN}.tar.gz`,
      mimeType: "application/gzip",
      buffer: Buffer.from("this is not a valid gzip archive"),
    });
    await S.adminPage!.getByRole("button", { name: "Import as draft" }).click();
    await expect(S.adminPage!.getByText(/rejected|failed/i)).toBeVisible();
    // No draft credential was created from the bogus import (no orphan for this run).
    expect(
      await count(`SELECT 1 FROM micro_credentials WHERE project_id=$1 AND code NOT IN ($2,$3)`, [
        S.projectId,
        CRED_A.code,
        CRED_B.code,
      ]),
    ).toBe(0);

    // §9 — REAL supported round-trip: import the exported archive through the UI. The
    // importer auto-suffixes code/slug (the supported collision-safe workflow).
    await S.adminPage!.goto("/admin/imports");
    await S.adminPage!.locator('select[name="projectId"]').selectOption({ label: PROJECT_NAME });
    await S.adminPage!.locator('input[type="file"]').setInputFiles({
      name: `cred-a-export-${RUN}.tar.gz`,
      mimeType: "application/gzip",
      buffer: body,
    });
    await S.adminPage!.getByRole("button", { name: "Import as draft" }).click();
    await expect(S.adminPage!.getByText(/Imported draft/)).toBeVisible();

    // Locate the imported draft (unique-suffixed, same project, not A/B).
    const imported = (await one<{ id: string; source_metadata: Record<string, unknown> }>(
      `SELECT mc.id, cv.source_metadata
         FROM micro_credentials mc
         JOIN credential_versions cv ON cv.credential_id = mc.id AND cv.status='draft'
        WHERE mc.project_id=$1 AND mc.id NOT IN ($2,$3) AND mc.status='draft'`,
      [S.projectId, S.credAId, S.credBId],
    ))!;
    expect(imported).toBeTruthy();
    // source_metadata records the private archive key, checksum, filename, source, time.
    const sm = imported.source_metadata;
    expect(sm.sourceType).toBe("olx");
    expect(String(sm.archiveObjectKey)).toBeTruthy();
    expect(String(sm.archiveSha256)).toMatch(/^[a-f0-9]{64}$/);
    expect(String(sm.originalFilename)).toContain(".tar.gz");
    expect(sm.importedAt).toBeTruthy();
    expect(String(sm.archiveObjectKey)).not.toMatch(/^([a-zA-Z]:[\\/]|\/|file:)/);

    // The imported draft opens in Admin and is absent from the learner catalogue.
    await S.adminPage!.goto(`/admin/credentials/${imported.id}`);
    await expect(S.adminPage!.getByRole("heading").first()).toBeVisible();
    // Supported Sections/Subsections/Units survived the round trip.
    const imp = (await one<{ content_document: { sections: unknown[] } }>(
      `SELECT content_document FROM credential_versions WHERE credential_id=$1 AND status='draft'`,
      [imported.id],
    ))!;
    expect(imp.content_document.sections.length).toBeGreaterThanOrEqual(1);
  });

  // ============================ §17 DIRECT DATABASE ASSERTIONS ============================
  test("database invariants after the full product journey", async () => {
    // Exactly the 11 application tables (+ schema_migrations operational).
    const tables = (
      await all<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema='public' AND table_type='BASE TABLE'`,
      )
    ).map((r) => r.table_name);
    for (const t of [
      "app_users",
      "projects",
      "micro_credentials",
      "credential_versions",
      "micro_programmes",
      "programme_credentials",
      "enrollments",
      "unit_progress",
      "assessment_attempts",
      "certificates",
      "platform_settings",
    ]) {
      expect(tables).toContain(t);
    }
    expect(tables).toContain("schema_migrations");

    // This run's project + published credentials + published programme.
    expect(await count(`SELECT 1 FROM projects WHERE id=$1`, [S.projectId])).toBe(1);
    expect(
      await count(`SELECT 1 FROM micro_credentials WHERE id IN ($1,$2) AND status='published'`, [
        S.credAId,
        S.credBId,
      ]),
    ).toBe(2);
    expect(
      await count(`SELECT 1 FROM micro_programmes WHERE id=$1 AND status='published'`, [S.progId]),
    ).toBe(1);

    // Membership contiguous, no duplicates.
    const pcs = await all<{ credential_id: string; position: number }>(
      `SELECT credential_id, position FROM programme_credentials WHERE programme_id=$1 ORDER BY position`,
      [S.progId],
    );
    expect(pcs.length).toBe(2);
    expect(new Set(pcs.map((p) => p.credential_id)).size).toBe(2);
    expect(pcs[1]!.position - pcs[0]!.position).toBe(1);

    // Enrolments: one A (reused), one programme, one B; exact revisions; one MCQ attempt; one certificate.
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND credential_id=$2`, [
        S.learnerUserId,
        S.credAId,
      ]),
    ).toBe(1);
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND programme_id=$2`, [
        S.learnerUserId,
        S.progId,
      ]),
    ).toBe(1);
    expect(
      await count(`SELECT 1 FROM enrollments WHERE user_id=$1 AND credential_id=$2`, [
        S.learnerUserId,
        S.credBId,
      ]),
    ).toBe(1);
    expect(
      await count(`SELECT 1 FROM assessment_attempts WHERE enrollment_id=$1`, [S.credAEnrolmentId]),
    ).toBe(1);
    // Exactly one certificate in this run (Credential A only; B threshold 100, partial).
    expect(
      await count(
        `SELECT 1 FROM certificates c JOIN enrollments e ON e.id=c.enrollment_id WHERE e.user_id=$1`,
        [S.learnerUserId],
      ),
    ).toBe(1);
    // platform_settings singleton; maintenance left off.
    expect(await count(`SELECT 1 FROM platform_settings`)).toBe(1);
    expect(
      (await one<{ maintenance_mode: boolean }>(
        `SELECT maintenance_mode FROM platform_settings WHERE id=1`,
      ))!.maintenance_mode,
    ).toBe(false);

    // No absolute path in any stored object key; no grading answer in learner content.
    const keys = await all<{ k: string }>(
      `SELECT banner_object_key AS k FROM credential_versions WHERE banner_object_key IS NOT NULL
       UNION ALL SELECT banner_object_key FROM micro_programmes WHERE banner_object_key IS NOT NULL
       UNION ALL SELECT pdf_object_key FROM certificates WHERE pdf_object_key IS NOT NULL`,
    );
    for (const { k } of keys) {
      expect(k).not.toMatch(/^([a-zA-Z]:[\\/]|\/|file:)/);
      expect(k).not.toContain("\\");
    }
    const pub = await all<{ content_document: unknown }>(
      `SELECT content_document FROM credential_versions WHERE status='published' AND credential_id IN ($1,$2)`,
      [S.credAId, S.credBId],
    );
    for (const row of pub) {
      expect(JSON.stringify(row.content_document)).not.toContain("correctOptionIds");
    }
  });
});

/** Extract unit IDs in document order. */
function unitIds(doc: unknown): string[] {
  const out: string[] = [];
  const d = doc as { sections?: { subsections?: { units?: { id: string }[] }[] }[] };
  for (const s of d.sections ?? [])
    for (const ss of s.subsections ?? []) for (const u of ss.units ?? []) out.push(u.id);
  return out;
}

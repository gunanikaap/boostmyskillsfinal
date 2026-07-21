# Actual Product Vertical — Local UAT Report

Browser-driven, end-to-end evidence for the real admin→learner
credential-to-certificate journey. **Test-auth-backed, not Clerk-backed** (see the
honesty statement at the end). Local evidence only — not cloud/UAT/Production.

## Provenance

- **Baseline SHA:** `bf711b5` (main, clean, synchronised with origin at phase start).
- **Feature branch:** `uat/actual-product-vertical`.
- **Commits (in order):**
  1. `2420e65` — docs(uat): correct acceptance mappings and blocker status.
  2. `4eb12ee` — fix(uat): close product-vertical UI defects + harden test-auth adapter.
  3. `8678704` — test(e2e): add authenticated product vertical (test-auth, browser-driven).
  4. _(this)_ docs(uat): record actual local product evidence.
- **Merge SHA / delivery SHA:** recorded in the terminal at delivery
  (`git rev-parse` after the `--no-ff` merge to main and push); a commit cannot
  embed its own hash.

## How it runs

`npm run test:e2e:auth` boots `next dev` under `APP_ENV=test` with the secret-gated
test-auth adapter, an **ephemeral per-run `TEST_AUTH_SECRET`** and **`E2E_RUN_ID`**,
`DATABASE_URL` pointed at the test database, blanked Clerk keys (edge middleware
pass-through, so server-side `requireAdmin`/`getCurrentAppUser` are the sole authz
boundary), and object storage isolated under `.data/e2e-storage` (git-ignored).
Separate admin / learner / second-learner / anonymous browser contexts each carry
their own test-auth headers. All created records embed `E2E_RUN_ID`.

## Exact UI journeys executed (18 browser tests)

**Admin authoring (§5–§6):**

- Create Credential A via the credentials form using **inline Project creation**,
  entering project name/slug/org + **certificate issuer + signatory**; the project
  becomes selected without losing credential form content; draft created.
- Author Credential A entirely in the **visual builder** (no raw JSON): Section
  "Introduction" → Subsection "Welcome" (Reading + Video units) → Subsection
  "Knowledge Check" (MCQ, 2 questions × 3 options, correct answers marked, pass
  mark 50, required units), certification threshold 50, About/context. Proven from
  the persisted draft: stable node IDs, `required:true`, **no `correctOptionIds` in
  content** while grading holds them.
- Reorder a unit via the UI ↓ control → order changes, **stable IDs unchanged**.
- Upload a PNG banner via the real form → logical key stored, **no absolute path**;
  draft absent from the public catalogue.
- Publish → appears in `/courses`; detail shows title/code/org/banner/About;
  learner-facing HTML contains no grading answers.
- Credential B (same Project) authored + banner + published.
- Programme created (Project, title, slug, About, banner); membership editor adds
  both credentials, **prevents duplicate selection**, reorders, sets required,
  saves; publish; public `/programs/{slug}` shows banner/title/org/About and the two
  member credentials in configured order; **draft programme was never public**;
  membership positions contiguous in the DB.

**Learner journey (§7–§11):**

- Direct enrol in Credential A via the **Enrol** button → "Enrolled successfully.";
  gains player access; re-enrol → "You are already enrolled." DB: exactly **one**
  enrolment bound to the **published revision**.
- Register for the Programme → DB: **one** programme enrolment, the prior Credential
  A enrolment **reused** (no duplicate), a new Credential B enrolment, snapshot
  carrying both credential IDs + both enrolment IDs; **idempotent** re-registration.
- Player renders **Reading**, **Video** (iframe) and **MCQ** unit types; mark-complete
  persists across reload ("✓ completed"); MCQ submitted correctly → **100%**, and a
  second attempt is **blocked** ("Assessment submitted … No further attempts.").
  DB: exactly **one** `assessment_attempts` row, `passed=true`, `percentage=100`,
  grading snapshot present; credential progress **100%** on the dashboard.
- **Certificate** issued automatically (exactly one row); snapshot carries the
  Project template issuer; the learner sees it in the account; owner downloads the
  PDF via the UI route (response begins `%PDF-`); **anonymous 401** and **another
  learner denied**; public verification shows VALID and leaks no email / Clerk ID /
  DB ID / answers / grading.

**Programme progress (§10):** learner completes Credential B content; the dashboard
shows both member credentials' own progress. _A single aggregate programme-progress
widget is not implemented_ → **US-L-14 stays PARTIAL** (documented UI gap, not data).

**Lifecycle + admin ops (§12–§16):**

- **Credential hide/unhide:** admin hides A → absent from catalogue; public detail,
  player and a bookmarked `/learn` URL all 404; a second learner cannot reach the
  detail to enrol; dashboard shows "Temporarily unavailable" with no Resume link;
  admin can still open it; the existing certificate stays downloadable and publicly
  verifiable; stored history (attempt, progress, certificate) unchanged; unhide →
  same `credential_version_id`, same certificate, learner can resume.
- **Programme hide/unhide:** hidden programme absent from `/programs`, detail 404
  (registration blocked); existing programme enrolment and member credential
  statuses unchanged; unhide restores the public detail.
- **Maintenance mode:** admin enables via the toggle; home and `/admin` stay open;
  learner `/dashboard`+`/learn` and anonymous `/courses` are redirected to
  `/maintenance` server-side (no bypass); `platform_settings` stays a single row;
  disable → normal access resumes. Left **off** at completion (with teardown safety).
- **Analytics + CSV:** the analytics table shows the learner row (display name, not
  email); CSV export returns `text/csv` with the expected RFC-4180 header and the
  test learner row, and **no** email / Clerk ID / grading / answers / storage path;
  learner (403) and anonymous (401) are denied the export route.
- **OLX:** admin export returns a real `.tar.gz` (gzip magic bytes) with a safe
  filename; the import UI **rejects** a non-archive upload and creates no draft. The
  full archive-safety matrix (traversal / symlink / hardlink / device / size-bomb,
  14 cases) remains covered by `olx-archive.test.ts`; benign round-trip import by
  `olx.test.ts`. No unsupported XBlock fidelity claimed; no real UAT→Prod promotion.

## Defects found and fixed (`4eb12ee`)

1. **Analytics page 500** — `pg` returns `timestamptz` as a JS `Date`, but the page
   called `enrolledAt.slice(0,10)`. The query/CSV were unit-tested; the page render
   never was. Fixed by normalising dates to ISO strings in `adminEnrolmentAnalytics`.
2. **Inline project creation lacked certificate issuer/signatory** — added those
   fields to the credential form and wired `createCredentialAction`.
3. **No credential About/context authoring field** — added to the create form
   (`createCredentialAction` already persisted `aboutHtml`), so the course detail
   renders it.

Adapter also hardened: reject empty Clerk id / email without `@` / unsupported
caller-supplied role; role is never carried into the identity (DB-only authz).

## Direct database assertions (§17)

Exactly the 11 application tables (+ `schema_migrations`); this run's one Project,
two published credentials, one published Programme; contiguous membership with no
duplicates; one Credential A enrolment (reused), one Programme enrolment, one
Credential B enrolment on exact revisions; one MCQ attempt; **exactly one
certificate**; `platform_settings` singleton with `maintenance_mode=false`; no
absolute/drive/`file:` object key anywhere; no `correctOptionIds` in any published
learner content.

## Quality gate (each command run separately, all exit 0)

| Gate | Result |
|------|--------|
| `format:check` / `lint` / `typecheck` | pass |
| `vitest run --no-file-parallelism` | **159 tests / 25 files** |
| `npm run test:e2e` | **7 passed** (auth-agnostic smokes) |
| `npm run test:e2e:auth` | **24 passed** (6 authorization + 18 product vertical) |
| `npm run build` | pass |
| `npm run security:audit` | 0 critical / 0 high |
| `db:backup` + `db:restore:verify` | pass (12 tables, migrations=3, counts match) |
| secret scan + `git diff --check` | clean |

No test was weakened or removed to pass. No migrations were touched; the frozen
architecture is unchanged.

## Acceptance-status changes

- **US-L-09** (credential enrolment), **US-L-10** (programme registration),
  **US-L-11** (unit access by type) → **PASS (local)** with the browser evidence above.
- **US-L-14** (programme aggregate progress) → **remains PARTIAL** (no aggregate
  widget). **US-L-05** literal reset-link parity remains a product-owner decision.
- US-A-03 / US-A-11 / US-L-07 corrected to fold programme banner+About evidence;
  US-A-20 is a single row (learner activity reporting). B-CLERK / B-EMAIL refreshed.

## External blockers (unchanged — PARTIAL/BLOCKED)

Historical migration (US-L-04); Production/UAT email delivery; real deployed Clerk
webhook; **Clerk-session** automated E2E (B-CLERK-E2E); real Backblaze B2; real
RDS/RDS-Proxy; Amplify deployment; real cross-environment OLX promotion; unsupported
OLX XBlocks.

## Honesty statement

- The product vertical is **test-auth-backed, NOT Clerk-backed** — driven by the
  secret-gated adapter that activates only under `APP_ENV=test` (unreachable in
  local/uat/production, unit-proven in `tests/unit/test-auth-adapter.test.ts`).
- Real **Clerk browser authentication** (sign-up, email verification, email +
  username login, profile sync, password reset via the Development email-code
  method) was proven **separately and manually** against the Clerk Development
  instance (US-L-01/02/03/05/06, US-A-17).
- This is **local evidence only** — not cloud UAT, not Production readiness.

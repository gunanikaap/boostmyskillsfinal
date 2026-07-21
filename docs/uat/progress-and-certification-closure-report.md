# Progress, Certification & Acceptance-Integrity Closure — Local UAT Report

Closes the local correctness gaps a follow-up architecture review flagged:
progress calculation, hierarchy/programme progress UI, last-access, certificate
issuance on every eligibility transition, honest grading/banner evidence, and a
supported OLX UI round-trip. **Test-auth-backed, not Clerk-backed. Local evidence
only — no B2 / RDS / Amplify / cloud-UAT claim.**

## Provenance

- **Baseline SHA:** `b207843` (main, clean, synced at phase start).
- **Feature branch:** `fix/progress-certification-acceptance`.
- **Commits (in order):**
  1. `fix(progress): calculate against all assigned units`
  2. `fix(storage): structural banner validation + media content type`
  3. `feat(learner): show hierarchy and programme aggregate progress`
  4. `fix(certificates): issue on all eligibility transitions`
  5. `test(e2e): correct grading and banner evidence + supported OLX UI round-trip`
  6. `docs(uat): record local acceptance closure`
- **Merge SHA / delivery SHA:** reported in the terminal at delivery (`git rev-parse`
  after the `--no-ff` merge + push); a commit cannot embed its own hash.

## §2 — Old progress defect and corrected formula

**Old:** dashboard + analytics used `AVG(progress_percent)` over the `unit_progress`
rows that happened to exist. With 1 completed unit of 4 assigned (3 rows missing),
that returned **100%** — wrong.

**New — one canonical module** (`lib/progress/calculate.ts`), used by the learner
dashboard, the player Section/Subsection/Unit status, programme aggregate, admin
analytics and the CSV export. It enumerates **every** unit in the learner's
**assigned** `content_document`:

- a missing `unit_progress` row = not_started / 0; stored progress clamped 0–100;
- a unit is completed when its stored status is `completed` OR progress is 100;
- Subsection / Section / Credential % = arithmetic mean of **all** their units'
  percentages; empty structures never divide by zero;
- **documented rounding:** nearest integer, ties up (`Math.round`);
- bound to the enrolment's assigned revision, so publishing a new revision never
  changes an existing learner's progress.

11 unit tests (`progress-calculate.test.ts`) prove 0/25/50%, 12.5→13 rounding,
100%, obsolete-row-ignored, id-counted-once, empty-structure, section-mean-over-
all-units.

## §3 — Section/Subsection/Unit status (browser)

The player renders an accessible `LevelStatus` (text label + % + progress bar +
`role="status"` aria-label; not colour alone) at Overall / Section / Subsection
level, plus per-unit status. Browser-verified: initially Not started/0% everywhere;
completing one unit updates that unit, its subsection, its section and overall;
the other subsection stays Not started; reload preserves; all-complete → 100% /
Completed at every level.

## §4 — Programme aggregate progress (service + UI + tests)

`listMyProgrammeProgress` reads the **immutable registration snapshot**
(`enrollments.metadata.registration`), not the current `programme_credentials`, so
later programme edits / new revisions can't mutate an existing learner's membership.
Aggregate = mean of member canonical %; complete only at 100%; shared credential
counted once (one reused enrolment). Dashboard shows a programme card: title,
aggregate %, "X of N credentials completed", per-member %, Open/Resume links.
5 DB tests: 0→50→100, 2-of-2, shared-once, idempotent re-registration, new-revision
doesn't change aggregate, hide/unhide preserves % + IDs, membership locked after
registrations. Browser: card aggregate + hidden-programme read-only "Temporarily
unavailable" with no Open link.

## §5 — Last-access

`last_accessed_at` is stamped server-side (`now()`, never a client value) on player
open, progress write and assessment submit — only after authorisation. Proven
(`progress-certificate.test.ts`): null before any access; non-null after open;
advances on progress + submit; another user cannot touch an enrolment; hidden
access does not update it; admin analytics + CSV surface the value.

## §6 — Certificate issuance from every eligibility path

`recordUnitProgress` now calls the idempotent `issueCertificateIfEligible` in the
same transaction (previously only `submitMcqAttempt` did). Certification requires
the threshold on graded units AND all required units complete; the builder gained a
**"Required for certification"** unit selector (`certificationRule` prunes ids to
existing units). Progress is **monotonic** (completed never regresses, % never
decreases, `completed_at` stable). Proven (service + browser): no cert before
eligibility; no-MCQ credential certifies on the required reading; **MCQ-pass-first
then required-Reading-later issues on the later action**; reading-first + MCQ-last
works; retries never duplicate; hidden blocks progress before any check.

## §7 — Corrected MCQ evidence

The browser fixture now uses **neutral** option labels (`4 / 5 / 6`,
`Paris / Rome / Berlin`); correctness is set only through the admin grading
checkbox. The learner selects the intended answer by neutral label scoped to each
question. Assertions prove the learner response contains no `correctOptionIds` /
`grading_document` / `gradingDocument` / `grading_snapshot`, and no option carries
a correctness marker before submission.

## §8 — Valid decodable banner + stronger validation

Fixtures are now **real, fully-decodable** images (`makePng` generates a valid
IHDR+IDAT+IEND PNG; a known-valid JPEG). `validateBanner` now parses the image
structure (PNG/JPEG dimensions, WebP RIFF) and rejects a signature-only/truncated
file or zero dimensions — magic bytes alone are no longer enough. The `/media`
route sniffs bytes to serve the correct `image/*` content type. Browser: upload
succeeds, published banner is public with `image/png` content type and
`naturalWidth/Height > 0`, draft media is admin-only. 6 validation unit tests
(valid PNG, valid JPEG, signature-only rejected, zero-dims rejected, mismatch
rejected, oversized rejected).

## §9 — Supported OLX UI round-trip

Export Credential A → import the real `.tar.gz` through the Admin import form
(importer auto-suffixes code/slug — the supported collision-safe path). The
imported draft opens in Admin, is absent from the learner catalogue, and its
`source_metadata` records logical `archiveObjectKey` + `archiveSha256` +
`originalFilename` + `sourceType` + `importedAt`; the original archive is private
(admin download 200, learner 403, anon 401); supported Sections/Subsections/Units
survive. **XBlock breadth remains PARTIAL; no UAT→Prod promotion (US-A-16 BLOCKED).**

## §17 — Database assertions

Unchanged 11-table architecture (+ `schema_migrations`); one project; two published
credentials; one published programme with contiguous, non-duplicate membership;
one reused Credential-A enrolment, one programme enrolment, one Credential-B
enrolment on exact revisions; one MCQ attempt; **exactly one certificate**;
`platform_settings` singleton left `maintenance_mode=false`; no absolute object key
anywhere; no `correctOptionIds` in any published learner content.

## Quality gate (each command run separately, all exit 0)

| Gate | Result |
|------|--------|
| `format:check` / `lint` / `typecheck` | pass |
| `vitest run --no-file-parallelism` | **187 tests / 29 files** |
| `npm run test:e2e` | **7 passed** (auth-agnostic smokes) |
| `npm run test:e2e:auth` | **24 passed** (6 authorization + 18 product vertical) |
| `npm run build` | pass |
| `npm run security:audit` | 0 critical / 0 high |
| `db:backup` + `db:restore:verify` | pass (12 tables, migrations=3, counts match) |
| secret scan + `git diff --check` | clean |

No migrations were edited; no application tables added/removed; no test weakened
(banner fixtures were **strengthened** to real images). New tests since baseline:
progress-calculate (11), programme-progress (5), progress-certificate (6),
banner-validation (6) — Vitest 159 → **187**.

## Acceptance-status changes

- **US-L-13** → **PASS (local)** (canonical progress + Section/Subsection/Unit
  browser status).
- **US-L-14** → **PASS (local)** (programme aggregate service + dashboard card +
  browser + 5 DB tests).
- **US-L-15** retained **PASS (local)** with all eligibility-transition edge cases.
- **US-A-20** retained **PASS (local)** with real `last_accessed_at` evidence.
- **US-A-14** → supported UI round-trip **PASS (local)**; XBlock breadth **PARTIAL**.
- **US-L-05** stays **PARTIAL** (reset-code vs reset-link parity is a product-owner
  decision). External cloud/migration items stay PARTIAL/BLOCKED.

## Honesty statement

- All product **browser** tests are **test-auth-backed** (secret-gated adapter,
  `APP_ENV=test` only; unreachable in local/uat/production).
- Real **Clerk** browser authentication was proven **separately and manually**.
- Evidence is **local only** — no Backblaze B2, RDS/RDS-Proxy, Amplify, or cloud-UAT
  claim is being made.

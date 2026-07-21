# UAT Acceptance Matrix

Status legend: **PASS** (implemented + automated test evidence), **PARTIAL**
(implemented and service-tested, but end-to-end/UI or an external dependency is
not yet verified), **BLOCKED** (needs an external credential/data/decision),
**NOT STARTED**.

> Honesty rule (§15): the following are **never** marked PASS without external
> evidence and are therefore PARTIAL/BLOCKED here: real historical learner
> migration, real email delivery, real UAT→Prod OLX promotion, real UAT cloud
> deployment, real Clerk integration, real B2 integration, real RDS/RDS-Proxy.

Automated evidence lives in `tests/` and runs via `npm test` (**137 Vitest tests**,
real PostgreSQL) + `npm run test:e2e` (**7 Playwright**, real dev server + Clerk
dev keys). Test files are cited per row.

> **"PASS (local)" evidence basis (local-vertical-product-flow phase):** the UI is
> implemented and build-verified, AND the underlying workflow is proven by
> service/integration tests against real PostgreSQL (and, for auth-agnostic paths,
> by the 7 real-browser Playwright smokes). It does **not** claim a fully
> automated authenticated browser click-through of that specific screen — driving
> the complete authenticated admin+learner journey through Playwright with Clerk
> testing tokens is a documented follow-up. It is **not** a claim of cloud/UAT or
> Production readiness.

## Learner stories

| ID | Story | Implementation | Test | Status | Notes / blocker |
|----|-------|----------------|------|--------|-----------------|
| US-L-01 | Registration | `app/sign-up`, `middleware.ts`, `components/AuthControls.tsx`, `lib/auth/*`, migration 003 | `sync.test.ts` (10), `webhook.test.ts` (6), E2E | PASS (local) | REAL Clerk dev sign-up completed (email + **username** + password). Lazy sync created exactly ONE `app_users` row: email normalized, username stored, `clerk_user_id` present, `role=learner`. |
| US-L-02 | Email verification | Clerk-hosted (email_code, verify-at-sign-up) | instance config | PASS (dev) | REAL email-code verification completed during the sign-up (Clerk **Development** email). Production email delivery remains B-EMAIL. |
| US-L-03 | Login / dashboard | `app/sign-in`, `app/dashboard`, `middleware.ts` | `access.test.ts`, E2E, live browser | PASS (local) | REAL **email login** AND **username login** both succeeded (authenticated app access; `/admin` renders); anonymous `/dashboard` 307→`/sign-in`. Minor UX note: after sign-in Clerk lands on `/` (per `SIGN_IN_FALLBACK_REDIRECT_URL`); `/dashboard` is reachable and works — set the fallback to `/dashboard` for a direct landing if desired. |
| US-L-04 | Historical learner migration | `lib/migration/service.ts`, `scripts/migration/dry-run.mts` | `tests/db/migration.test.ts` | BLOCKED | No source export + no Clerk mapping strategy (B-MIGRATE, B-CLERK). Dry-run + idempotent upsert implemented and tested; never fabricates. |
| US-L-05 | Password reset | Clerk-hosted recovery | live browser | PARTIAL | The secure forgot-password flow PASSED locally on the Clerk **Development** instance (new password set, login succeeded, same `app_users` row + admin role). BUT the dev instance uses an email **CODE** while the strict employer AC requires a reset **LINK**. Literal link parity remains a **product-owner acceptance decision** — NOT marked strict PASS until explicitly accepted as equivalent. Production email = B-EMAIL. |
| US-L-06 | Profile editing | Clerk profile + `syncAppUser` (username/email/name) | `sync.test.ts` (10), live browser + DB | PASS (local) | REAL Clerk profile name edit → loading an authenticated page lazily synced `app_users` (first/last name now populated, `updated_at > created_at`); **same Clerk ID + same `app_users.id`** (single row updated in place); **role stayed admin**. |
| US-L-07 | Published catalogue detail | `app/courses`, `app/programs`, `lib/catalogue/queries.ts` | `publication.test.ts`, `programmes.test.ts` | PASS | Published-only reads verified. |
| US-L-08 | Draft invisibility | `lib/catalogue/queries.ts`, page `notFound()` | `publication.test.ts`, `hidden-state.test.ts` | PASS | Draft/hidden absent from list/detail/sitemap. |
| US-L-09 | Credential enrolment | `lib/enrolments/service.ts`, `app/courses/[slug]` | `publication.test.ts`, `hidden-state.test.ts` | PARTIAL | Idempotent enrol service tested; UI enrol needs auth (Clerk). |
| US-L-10 | Programme registration | `lib/enrolments/service.ts` `registerForProgramme` | `programme-registration.test.ts` (5) | PASS (local) | Transactional fan-out proven: one programme enrolment + one credential enrolment per member, snapshot of assigned versions + enrolment ids, reuse of a prior direct enrolment (no duplicate), idempotent re-registration. UI register button wired; authenticated browser E2E is a follow-up. |
| US-L-11 | Unit access by type | `app/learn/[credentialId]`, `lib/player/service.ts` | `assessment.test.ts`, `hidden-state.test.ts` | PARTIAL | Content access + hidden enforcement tested; player UI not E2E-driven. |
| US-L-12 | MCQ score / pass | `lib/player/grade.ts`, `submitMcqAttempt` | `assessment.test.ts` | PASS | Server-side scoring, one-attempt, idempotent double-submit. |
| US-L-13 | Credential progress | `recordUnitProgress`, `lib/learner/queries.ts` | `assessment.test.ts`, `hidden-state.test.ts` | PASS | Validated unit progress. |
| US-L-14 | Programme aggregate progress | registration snapshot in `metadata` | `programmes.test.ts` | PARTIAL | Snapshot stored; aggregate roll-up UI is basic. |
| US-L-15 | Automatic certificate issuance | `issueCertificateIfEligible` in submit tx | `certificates.test.ts`, `hidden-state.test.ts` | PASS | Idempotent, threshold-gated, server-side. |
| US-L-16 | PDF certificate download | `lib/certificates/pdf.ts`, `app/account/certificates/[code]/download` | `certificates.test.ts` (PDF render + owner SQL) | PASS (local) | On-demand PDF generation proven (valid `%PDF-`); download route is owner-guarded (ownership checked in SQL, not the URL); public verification never exposes the PDF route. Permanent storage not required. |

## Admin stories

| ID | Story | Implementation | Test | Status | Notes / blocker |
|----|-------|----------------|------|--------|-----------------|
| US-A-01 | Create credential draft | `createCredentialWithDraft`, `app/admin/credentials` | `publication.test.ts` | PASS | |
| US-A-02 | Inline project creation | `createCredentialAction` (tx), `CredentialForm` | build + service | PASS (local) | Credential form creates the project + credential atomically in one submit (no lost form content); server-side admin-guarded; duplicate slug errors surfaced. UI implemented + build-verified; underlying tx service-tested. |
| US-A-03 | Banner upload/display | `lib/storage/*`, `app/admin/credentials/[id]/banner`, `app/media/[...key]`, course detail `<img>` | `storage.test.ts` (16), `storage-integration.test.ts` | PASS (local) | Local provider: admin banner upload (MIME+signature+size validated), controlled `/media` serve (published=public, draft/hidden=admin), detail renders banner. Provider-neutral key. Real B2 still B-B2. |
| US-A-04 | About/context | `saveDraft` (sanitised), detail render | `content.test.ts` (sanitiser) | PASS | |
| US-A-05 | Hierarchy authoring | **Visual builder** `ContentBuilder.tsx` + `lib/admin/builder/model.ts` | `builder-model.test.ts` (5), `builder-integration.test.ts` (2) | PASS (local) | Section→Subsection→Unit visual CRUD (add/edit-title/remove-with-confirm); raw JSON only behind an advanced read-only disclosure — **no longer required**. Assembled docs pass the real publish validator; correct answers go to grading only (unit-tested). |
| US-A-06 | Reorder without regenerating IDs | builder Up/Down + stable-ID model | `builder-model.test.ts` (round-trip), `publication.test.ts` | PASS (local) | Accessible Up/Down at each level; IDs generated once (`newId`) and preserved on edit/reorder (round-trip test); publish preserves IDs. |
| US-A-07 | Unit-type editors | builder Video/Reading/MCQ editors | `builder-model.test.ts`, `builder-integration.test.ts`, `content.test.ts` | PASS (local) | Video (URL validate + preview), Reading (text + learner preview, sanitised server-side), MCQ (questions/options/correct/pass-mark, max-attempts=1). No raw JSON needed. |
| US-A-08 | MCQ authoring / scoring | grading contract + grader | `content.test.ts`, `assessment.test.ts` | PASS | |
| US-A-09 | Certification rule | `certification_rule`, `computeCredentialResult` | `certificates.test.ts` | PASS | |
| US-A-10 | Project certificate template | `projects.certificate_template`, cert snapshot | `certificates.test.ts` | PASS | |
| US-A-11 | Programme creation + membership | `lib/programmes/service.ts`, `app/admin/programmes/[id]` MembershipEditor | `programmes.test.ts`, `programme-registration.test.ts` (5) | PASS (local) | Visual membership editor: add same-project credentials (no duplicates), Up/Down order, required flag, publish (≥2 publishable), hide/unhide. Registration fan-out/dedup/idempotency + contiguous positions + hide-preservation tested. |
| US-A-12 | Publishing | `publishCredential`, `publishProgramme` | `publication.test.ts`, `programmes.test.ts` | PASS | Atomic, validated, immutable revisions. |
| US-A-13 | Hide / unhide | hide/unhide services | `hidden-state.test.ts` | PASS | Full 20-step lifecycle. |
| US-A-14 | OLX import → draft review + archive storage | `lib/olx/importer.ts`, `lib/storage/*`, `app/admin/imports`, `app/admin/credentials/[id]/olx-archive` | `olx.test.ts`, `olx-archive.test.ts`, `storage-integration.test.ts` | PARTIAL | Import→draft + archive-safety tested; **original archive now persisted privately via the storage provider** (admin-only download, denied anon/learner). Full Open edX XBlock fidelity NOT claimed. |
| US-A-15 | Unsafe archive rejection | `lib/olx/archiveSafety.ts` | `olx-archive.test.ts` (14) | PASS | Traversal/symlink/hardlink/device/size-bomb/etc. |
| US-A-16 | UAT→Prod OLX promotion | export + import round trip | `olx.test.ts` | PARTIAL | Round-trip proven locally; real cross-env promotion BLOCKED (B-DEPLOY). |
| US-A-17 | Server-side admin denial + admin access | `requireAdmin` on layout + every action/route | `access.test.ts` (8), real HTTP, live browser | PASS | REAL user promoted via `promote.mts` (exactly 1 row); anonymous `/admin`/CSV-export/OLX all 307/401/403; browser `role='learner'` ignored on the REAL row (stayed admin). **Live:** the promoted admin's `/admin` dashboard renders Projects/Credentials/Programmes/Analytics/Maintenance, and `/admin` still renders after email login, username login, profile edit and password reset. |
| US-A-18 | Maintenance mode | `platform_settings`, guard + `/maintenance` page | `access.test.ts` (gate) | PASS | Server-side; singleton; no redeploy. |
| US-A-19 | Enrolment analytics | `lib/admin/analytics.ts`, `app/admin/analytics` | `analytics.test.ts` | PASS | |
| US-A-20 | Learner activity | analytics rows (last access, progress) | `analytics.test.ts` | PASS | |
| US-A-21 | Grade / pass reporting | analytics rows (passed, final %) | `analytics.test.ts` | PASS | |
| US-A-22 | CSV export | `analyticsToCsv`, `app/admin/analytics/export` | `analytics.test.ts` | PASS | RFC-4180-safe; admin-guarded route. |

## External-evidence gate (never PASS here)

| Item | Status | Blocker |
|------|--------|---------|
| Real historical learner migration | BLOCKED | B-MIGRATE, B-CLERK |
| Real email delivery | BLOCKED | B-EMAIL (Clerk) |
| Real UAT→Prod OLX promotion | BLOCKED | B-DEPLOY |
| Real UAT cloud deployment | BLOCKED | B-DEPLOY |
| Real Clerk integration | BLOCKED | B-CLERK |
| Real B2 integration | BLOCKED | B-B2 |
| Real RDS / RDS Proxy | BLOCKED | B-DEPLOY |

See `docs/uat/known-blockers.md` for blocker detail and owners.

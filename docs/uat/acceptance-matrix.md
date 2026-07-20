# UAT Acceptance Matrix

Status legend: **PASS** (implemented + automated test evidence), **PARTIAL**
(implemented and service-tested, but end-to-end/UI or an external dependency is
not yet verified), **BLOCKED** (needs an external credential/data/decision),
**NOT STARTED**.

> Honesty rule (§15): the following are **never** marked PASS without external
> evidence and are therefore PARTIAL/BLOCKED here: real historical learner
> migration, real email delivery, real UAT→Prod OLX promotion, real UAT cloud
> deployment, real Clerk integration, real B2 integration, real RDS/RDS-Proxy.

Automated evidence lives in `tests/` and runs via `npm test` (78 tests, real
PostgreSQL). Test files are cited per row.

## Learner stories

| ID | Story | Implementation | Test | Status | Notes / blocker |
|----|-------|----------------|------|--------|-----------------|
| US-L-01 | Registration | `app/sign-up`, `middleware.ts`, `components/AuthControls.tsx`, `lib/auth/*`, webhook `app/api/webhooks/clerk` | `tests/db/access.test.ts` (sync/role) | PARTIAL | Clerk **dev instance integrated** (keys in `.env.local`); sign-up page + header controls render; app-user sync + default-learner role tested. Remaining: a real browser sign-up (user action). |
| US-L-02 | Email verification | Clerk-hosted | — | PARTIAL | Clerk dev instance live; email verification is exercised by completing a real sign-up. Deployed delivery still B-EMAIL. |
| US-L-03 | Login / dashboard | `app/sign-in`, `app/dashboard`, `middleware.ts` | `access.test.ts` | PARTIAL | Clerk sign-in renders; protected `/dashboard` redirects to `/sign-in` (verified via dev server). Dashboard queries tested. |
| US-L-04 | Historical learner migration | `lib/migration/service.ts`, `scripts/migration/dry-run.mts` | `tests/db/migration.test.ts` | BLOCKED | No source export + no Clerk mapping strategy (B-MIGRATE, B-CLERK). Dry-run + idempotent upsert implemented and tested; never fabricates. |
| US-L-05 | Password reset | Clerk-hosted | — | BLOCKED | Clerk keys (B-CLERK). |
| US-L-06 | Profile editing | Clerk profile + `syncAppUser` | `access.test.ts` | PARTIAL | Sync path tested; Clerk profile UI needs keys. |
| US-L-07 | Published catalogue detail | `app/courses`, `app/programs`, `lib/catalogue/queries.ts` | `publication.test.ts`, `programmes.test.ts` | PASS | Published-only reads verified. |
| US-L-08 | Draft invisibility | `lib/catalogue/queries.ts`, page `notFound()` | `publication.test.ts`, `hidden-state.test.ts` | PASS | Draft/hidden absent from list/detail/sitemap. |
| US-L-09 | Credential enrolment | `lib/enrolments/service.ts`, `app/courses/[slug]` | `publication.test.ts`, `hidden-state.test.ts` | PARTIAL | Idempotent enrol service tested; UI enrol needs auth (Clerk). |
| US-L-10 | Programme registration | `lib/enrolments/service.ts` `registerForProgramme` | `programmes.test.ts` | PARTIAL | Snapshot + per-credential enrolment tested; UI needs auth. |
| US-L-11 | Unit access by type | `app/learn/[credentialId]`, `lib/player/service.ts` | `assessment.test.ts`, `hidden-state.test.ts` | PARTIAL | Content access + hidden enforcement tested; player UI not E2E-driven. |
| US-L-12 | MCQ score / pass | `lib/player/grade.ts`, `submitMcqAttempt` | `assessment.test.ts` | PASS | Server-side scoring, one-attempt, idempotent double-submit. |
| US-L-13 | Credential progress | `recordUnitProgress`, `lib/learner/queries.ts` | `assessment.test.ts`, `hidden-state.test.ts` | PASS | Validated unit progress. |
| US-L-14 | Programme aggregate progress | registration snapshot in `metadata` | `programmes.test.ts` | PARTIAL | Snapshot stored; aggregate roll-up UI is basic. |
| US-L-15 | Automatic certificate issuance | `issueCertificateIfEligible` in submit tx | `certificates.test.ts`, `hidden-state.test.ts` | PASS | Idempotent, threshold-gated, server-side. |
| US-L-16 | PDF certificate download | `lib/certificates/pdf.ts`, `app/account/certificates/[code]/download` | `certificates.test.ts` (PDF render) | PARTIAL | PDF renderer tested; owner-guarded route needs auth session to exercise E2E. |

## Admin stories

| ID | Story | Implementation | Test | Status | Notes / blocker |
|----|-------|----------------|------|--------|-----------------|
| US-A-01 | Create credential draft | `createCredentialWithDraft`, `app/admin/credentials` | `publication.test.ts` | PASS | |
| US-A-02 | Inline project creation | `createCredentialAction` (tx), `CredentialForm` | build + service | PARTIAL | Inline-project path implemented; UI not E2E-driven. |
| US-A-03 | Banner upload/display | `banner_object_key` fields, B2 adapter pending | — | PARTIAL | Schema + keys present; real B2 upload BLOCKED (B-B2). |
| US-A-04 | About/context | `saveDraft` (sanitised), detail render | `content.test.ts` (sanitiser) | PASS | |
| US-A-05 | Hierarchy authoring | JSON draft editor + Zod validation | `content.test.ts`, `publication.test.ts` | PARTIAL | Integrity fully enforced; rich drag/drop builder is a UAT cut (§17). |
| US-A-06 | Reorder without regenerating IDs | stable-ID model; publish preserves IDs | `publication.test.ts` (revision binding) | PARTIAL | IDs stable in model; visual reorder UI cut. |
| US-A-07 | Unit-type editors | player + JSON authoring | `content.test.ts` | PARTIAL | Typed editors are JSON-based for UAT. |
| US-A-08 | MCQ authoring / scoring | grading contract + grader | `content.test.ts`, `assessment.test.ts` | PASS | |
| US-A-09 | Certification rule | `certification_rule`, `computeCredentialResult` | `certificates.test.ts` | PASS | |
| US-A-10 | Project certificate template | `projects.certificate_template`, cert snapshot | `certificates.test.ts` | PASS | |
| US-A-11 | Programme creation | `lib/programmes/service.ts`, `app/admin/programmes` | `programmes.test.ts` | PASS | Membership editor UI is minimal (service tested). |
| US-A-12 | Publishing | `publishCredential`, `publishProgramme` | `publication.test.ts`, `programmes.test.ts` | PASS | Atomic, validated, immutable revisions. |
| US-A-13 | Hide / unhide | hide/unhide services | `hidden-state.test.ts` | PASS | Full 20-step lifecycle. |
| US-A-14 | OLX import → draft review | `lib/olx/importer.ts`, `app/admin/imports` | `olx.test.ts`, `olx-archive.test.ts` | PARTIAL | Import→draft + safety tested; full Open edX XBlock fidelity NOT claimed. |
| US-A-15 | Unsafe archive rejection | `lib/olx/archiveSafety.ts` | `olx-archive.test.ts` (14) | PASS | Traversal/symlink/hardlink/device/size-bomb/etc. |
| US-A-16 | UAT→Prod OLX promotion | export + import round trip | `olx.test.ts` | PARTIAL | Round-trip proven locally; real cross-env promotion BLOCKED (B-DEPLOY). |
| US-A-17 | Server-side admin denial | `requireAdmin` on layout + every action/route | `access.test.ts` | PASS | Anonymous/learner denied; role-from-browser ignored. |
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

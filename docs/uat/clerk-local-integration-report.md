# Clerk / Local-Storage / Local-PostgreSQL Integration — Final Evidence Report

Generated from live repository, environment, database and test inspection. No
secret values appear in this document (env vars are reported only as
configured / missing / not required; personal email redacted).

Status values: PASS · PARTIAL · BLOCKED · NOT IMPLEMENTED · NOT TESTED.

---

## 1. Executive verdict

**PARTIALLY VERIFIED FOR LOCAL DEVELOPMENT.**

Clerk authentication is genuinely integrated against a **development** instance
and verified at the routing/rendering layer: `clerk doctor` passes, sign-in/sign-up
pages render Clerk, protected routes redirect to `/sign-in`, and the full
`npm run verify` pipeline (format, lint, typecheck, 78 tests, production build)
exits 0 on real PostgreSQL 16.14. However, a real end-to-end browser sign-up,
email verification, and the Clerk webhook were **not** exercised (no signed
fixture or relayed event), and three items named in the review brief —
**local-storage provider abstraction, PostgreSQL pool/CA portability additions,
and a backup/restore script — were not implemented in this session** and are
reported NOT IMPLEMENTED. Nothing external (B2, RDS, Amplify, production Clerk,
historical migration) is claimed done.

## 2. Repository and Git

| Item | Value |
|------|-------|
| Absolute path | `D:\boostmyskillsmain\boostmyskillsfinal` |
| Branch | `main` |
| HEAD SHA (before this report) | `12f70c1f501026960e7df8c5a80e009b66d03968` |
| Working tree | clean (`git status --short` empty) |
| origin URL | `https://github.com/gunanikaap/boostmyskillsfinal.git` |
| origin/main == local main | YES (both `12f70c1`) |
| Integration branch | none — repo started empty; work landed on `main` |
| Reference remote | push URL `DISABLED_NO_PUSH_TO_REFERENCE` (read-only, never pushed) |

- **Clerk-phase commit**: `12f70c1` "Integrate Clerk (dev instance) via Clerk CLI" — **pushed** (`4d1ad64..12f70c1 main -> main`, exit 0).
- **Tracked secret-bearing files**: NONE. `git ls-files | grep -iE '\.env|\.data|/uploads/|\.pem|\.key'` → none. `.env.local` is git-ignored (`git check-ignore .env.local` → IGNORED).
- **Files changed in `12f70c1`**: `middleware.ts`, `components/AuthControls.tsx` (new), `components/SiteHeader.tsx`, `docs/uat/known-blockers.md`, `docs/uat/acceptance-matrix.md`.

Status: **PASS** (clean tree, pushed, no secrets tracked).

## 3. Clerk configuration

| Item | Finding | Verified by |
|------|---------|-------------|
| Application name | "Boost My Skills" (`app_3G87KrNbe7G1khZGOgJX8C5Jfy4`) | `clerk doctor` output |
| Instance | **Development** (`ins_…`); production **not configured** | `clerk doctor` |
| Browser CLI auth | Succeeded — logged in as `gu***@mu.ie` | `clerk auth login` exit 0 |
| App linked to repo | YES (linked via git remote) | `clerk doctor` "Linked via git remote" |
| Production Clerk app modified | NO | only dev instance touched |
| Organizations enabled | NOT VERIFIED (Clerk config/API not queried) | — |
| Social login enabled | NOT VERIFIED | — |
| Phone auth enabled | NOT VERIFIED | — |

**Env vars (configured / missing only):**

| Variable | State |
|----------|-------|
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | configured |
| CLERK_SECRET_KEY | configured |
| CLERK_WEBHOOK_SIGNING_SECRET | missing |
| NEXT_PUBLIC_CLERK_SIGN_IN_URL | configured |
| NEXT_PUBLIC_CLERK_SIGN_UP_URL | configured |
| NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL | configured |
| NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL | configured |
| NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL (deprecated) | missing |
| NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL (deprecated) | missing |

- Deprecated `AFTER_SIGN_IN/UP` variables are **not referenced in code** (`grep` over app/lib/components/middleware → none) and are absent from env; the newer `FALLBACK_REDIRECT_URL` vars are used.

**Clerk auth configuration (email/username/password/verification/recovery/name):**
ALL items **NOT VERIFIED** in this session. They were neither queried via the
Clerk API nor exercised in a browser. The sign-in/sign-up pages render the Clerk
`<SignIn/>`/`<SignUp/>` components, which will enforce whatever the instance is
configured for — but this build does **not** implement username auth (see §3 DB:
no `username` column), so username sign-in is NOT IMPLEMENTED at the application
data layer regardless of Clerk instance settings.

Status: **PARTIAL** (integration + keys verified; instance auth-method settings not verified).

## 4. User synchronization and Admin authorization

**Sync code**: `lib/auth/appUser.ts` `syncAppUser()` + `getCurrentAppUser()`;
identity from `lib/auth/identity.ts`.

- **Lazy sync** (authenticated request → `getCurrentAppUser`): implemented; upserts on `clerk_user_id`.
- **Webhook sync**: `app/api/webhooks/clerk/route.ts` on `user.created`/`user.updated`.

| Field | Synced? |
|-------|---------|
| clerk_user_id | YES |
| email | YES |
| username | NO — no `username` column exists (verified: `information_schema.columns` for `app_users` = id, clerk_user_id, email, first_name, last_name, role, external_ref, created_at, updated_at) |
| first_name | YES |
| last_name | YES |

| Property | Finding | Evidence |
|----------|---------|----------|
| Idempotent | YES — `INSERT … ON CONFLICT (clerk_user_id) DO UPDATE` | code + `tests/db/access.test.ts` |
| Role preserved on user.updated | YES — role is NOT in the UPDATE set | code inspection |
| Role cannot be browser-supplied | YES — insert hardcodes `'learner'`; role never read from caller | `access.test.ts` "ignores a browser-supplied role — sync never elevates" (PASS) |
| Role via Clerk metadata | Not read anywhere (code inspection) | — |
| Existing admin cannot be demoted by webhook | YES — role untouched on update | `access.test.ts` (promote→re-sync stays admin) PASS |
| Missing primary email handled | Falls back to `""` (webhook + identity) — does not crash, but empty email is stored | code inspection (NOT TESTED with a real event) |
| Email collision handled | DB `UNIQUE(email)` → insert throws (fails closed, **not** gracefully reconciled) | code inspection |
| Username collision handled | N/A — no username | — |
| Email trimmed/lowercased | **NO** — email stored as received; no normalization implemented | code inspection |

Status: **PARTIAL** — role integrity is test-proven; email normalization and
graceful collision handling are NOT IMPLEMENTED; sync not exercised via a real event.

**Admin authorization** (`lib/access/guards.ts`, `tests/db/access.test.ts`):

| Check | Status | Evidence |
|-------|--------|----------|
| Anonymous denied /admin | PASS | `requireAdmin` → `unauthenticated`; verified `GET /admin` → 307 → `/sign-in` (dev server) |
| Learner denied /admin | PASS | `access.test.ts` "denies a learner the admin boundary" |
| Learner denied admin action/API | PASS | `requireAdmin` in every action + `app/admin/analytics/export` route |
| Admin allowed | PASS | `access.test.ts` "allows an admin" |
| Browser-modified role has no effect | PASS | `access.test.ts` |
| Clerk sync does not promote/demote | PASS | role preserved on conflict |
| app_users.role is the authz source | PASS | guards read DB role only |

## 5. Authentication journeys

| Journey | Status | Evidence type |
|---------|--------|---------------|
| Sign-up page renders Clerk | PASS | `curl /sign-up`… `/sign-in` HTTP 200 with Clerk markers (dev server) |
| Registration succeeds | NOT TESTED | needs real browser sign-up (user action) |
| Email verification succeeds | NOT TESTED | needs browser + Clerk email/code |
| Reaches dashboard after auth | NOT TESTED | requires an authenticated session |
| Logout succeeds | NOT TESTED | `UserButton` renders; flow not exercised |
| Email login succeeds | NOT TESTED | — |
| Username login succeeds | NOT IMPLEMENTED | no username column/flow |
| Forgotten-password reachable | NOT TESTED (code: Clerk-hosted) | — |
| Forgotten-password reset completes | NOT TESTED | — |
| Profile first-name sync | PARTIAL | sync path tested via adapter (`access.test.ts`); not via real Clerk profile edit |
| Profile last-name sync | PARTIAL | same |
| Anonymous dashboard denied | PASS | `GET /dashboard` → 307 → `/sign-in?redirect_url=…` (dev server) |
| Unsafe external return URL rejected | PASS | `lib/redirects/redirects.ts` `safeReturnPath`; `tests/unit/redirects.test.ts` (PASS) |
| Safe post-login redirect works | PARTIAL | middleware passes `returnBackUrl`; redirect emitted (307 with `redirect_url`), full round-trip not browser-tested |

**Playwright**: none configured (`grep playwright` → none). Playwright count = **0**.
Blocker: not set up in this build (time-boxed cut in the original brief; not added here).

Status: **PARTIAL** — routing/rendering/redirect verified; no real account journey completed.

## 6. Webhook evidence

- Route: `app/api/webhooks/clerk/route.ts`. Events: `user.created`, `user.updated`.
- Verification: `verifyWebhook` (svix under the hood) using `CLERK_WEBHOOK_SIGNING_SECRET`; returns **503** if the secret is unset, **400** on invalid signature, **200** on success.
- Local Clerk webhook relay: **NOT started**.
- `CLERK_WEBHOOK_SIGNING_SECRET`: **missing** (not configured locally).

| Claim | Proven by |
|-------|-----------|
| Unsigned/invalid signature rejected | code inspection only (503/400 paths) — NOT TESTED |
| Valid signed request accepted | NOT TESTED (no signed fixture, no relayed event) |
| Duplicate delivery idempotent | relies on `syncAppUser` idempotency (tested at service level) — webhook path NOT TESTED |
| Role unchanged on update | code inspection (role not in update) |
| Raw body / secrets not logged | code inspection — handler logs nothing |

Status: **NOT TESTED** (webhook is code-complete and signature-guarded, but no
real relayed event and no automated signed fixture exist). Not a proven real
Clerk webhook flow.

## 7. Local storage

**NOT IMPLEMENTED in this session.**

- `STORAGE_DRIVER`, `LOCAL_STORAGE_ROOT`, `STORAGE_KEY_PREFIX`: **missing** (not configured).
- No storage-provider interface, local provider, factory, or B2 boundary files exist (`find` for `*storage*`/`*b2*` → no source files).
- No `assets` table (correct per frozen architecture).
- The DB stores provider-neutral **logical string keys only** (`credential_versions.banner_object_key`, `micro_programmes.banner_object_key`, `certificates.pdf_object_key`, OLX `source_metadata.archiveObjectKey`). No absolute Windows paths, `file://` URLs, localhost URLs, or signed URLs are written (verified by code: these columns receive admin-supplied/derived keys or null; certificate PDFs are generated on demand, not stored).
- Certificate PDF: generated at download time (`lib/certificates/pdf.ts` + owner-guarded route); **not persisted** to any store yet.
- `.local-storage` is git-ignored, but no writer uses it.

Storage test count: **0** (no provider to test). Status: **NOT IMPLEMENTED**.

## 8. PostgreSQL and RDS portability

| Item | Finding |
|------|---------|
| Local PostgreSQL | **16.14** (verified `show server_version`) |
| SQLite used anywhere | NO (`pg` only) |
| DATABASE_POOL_MAX | **NOT IMPLEMENTED** — pool `max: 10` is hardcoded in `lib/db/pool.ts` (no env override) |
| DATABASE_SSL | handled — `databaseSsl()` → `ssl: { rejectUnauthorized: true }` when true, else undefined |
| DATABASE_SSL_CA_PATH | **NOT loaded** — present in `.env.example` only; no code reads/loads a CA file |
| rejectUnauthorized for UAT/Prod | YES (`true` whenever SSL is enabled) |
| DATABASE_URL → RDS Proxy without code change | YES (connection-string based; no hostname hardcoded) |
| Hardcoded DB hostname | NONE |
| Connection strings logged | NO |
| App vs migration TLS logic | migration runner uses a raw `pg` `Client` with the connection string; it does **not** apply the `ssl`/CA object the pool uses — TLS parity is **partial** (relies on `sslmode` in the URL) |

| Target | Proven? |
|--------|---------|
| Local PostgreSQL | PASS (16.14, migrations + 78 tests) |
| PostgreSQL 16 compatibility | PASS |
| RDS compatibility | design-ready only — NOT TESTED |
| RDS Proxy compatibility | design-ready only — NOT TESTED |
| AWS CA verification | NOT IMPLEMENTED (CA path not loaded) |
| Real RDS / RDS Proxy connection | NOT TESTED (BLOCKED — no AWS access) |

Status: **PARTIAL** (local PG proven; RDS/CA portability is design-ready/not implemented).

## 9. Backup and restore

**NOT IMPLEMENTED / documentation-only.** No `pg_dump` script exists; no backup
was created or restored into a verification database; no post-restore schema/row-
count comparison was run. `docs/operations/backup-and-rollback.md` describes the
RDS-snapshot approach only. Status: **NOT IMPLEMENTED** (execution), documentation present.

## 10. Tests and production build

- Command: `npm run verify` → **exit 0**. Summary: `PASS format:check · PASS lint · PASS typecheck · PASS test · PASS build`.
- Test totals: **13 test files, 78 tests, 78 passed, 0 failed, 0 skipped** (`vitest run --no-file-parallelism`).
- Production build: **success** (Next.js 15.2.3), **34 routes** (`page.tsx` + `route.ts`), Middleware 86.1 kB.
- Original pre-Clerk suite still passes (same 78 tests; Clerk changes touched middleware/header only; DB/auth tests use the test-auth adapter, unaffected by real keys because `APP_ENV=test` forces the adapter).

Per-area regression (all within the 78):
- PostgreSQL integration + schema constraints: PASS (`schema-constraints.test.ts` 14).
- Hidden-content: PASS (`hidden-state.test.ts`, 20-step).
- Maintenance/authz: PASS (`access.test.ts` 8).
- OLX: PASS (`olx-archive.test.ts` 14, `olx.test.ts` 3).
- Certificates: PASS (`certificates.test.ts` 5).
- Storage tests: none (NOT IMPLEMENTED). Clerk webhook tests: none (NOT TESTED). Playwright: 0.

Status: **PASS** (for the implemented surface).

## 11. Security and secret scan

- Scan: `git ls-files | xargs grep -lE 'sk_test_|sk_live_|whsec_|pk_live_|pk_test_…|AKIA…'` over tracked files → **no matches**.
- `.env.local` (real `pk_`/`sk_` dev keys) is git-ignored and untracked.
- No local upload/storage files (none produced).
- No screenshots/traces produced (no Playwright).
- Logs: handlers do not log emails, webhook bodies, submitted answers, grading documents, or secrets (code inspection).
- Findings: **Critical/High/Medium: none.** Low: (1) email is not normalized (case-sensitive uniqueness); (2) migration runner does not apply the CA/ssl object the pool uses (URL `sslmode` relied upon) — both noted, non-blocking for local dev.

Status: **PASS** (no secret exposure).

## 12. Architecture deviations

Final tables (verified via `pg_tables`): app_users, assessment_attempts,
certificates, credential_versions, enrollments, micro_credentials,
micro_programmes, platform_settings, programme_credentials, projects,
unit_progress — **exactly the 11 frozen tables**.

Confirmed **absent**: organisations, assets, sections, subsections, units,
questions, options, content_nodes, content_links, admin_jobs, audit_events,
programme_enrollment_items. No unapproved table introduced this phase (migrations
001/002 unchanged; no new migration added).

Invariants (unchanged, test-backed): platform_settings singleton (PASS);
hidden blocks content but preserves history (PASS); unhide restores same
enrolment + revision (PASS); published revisions immutable (PASS);
grading_document never returned to learners (PASS); one-attempt server-enforced
(PASS); certificates available when hidden (PASS).

**Deviations from the review brief's assumed scope** (not architecture violations,
but scope gaps): no `username` column / username auth; no storage-provider
abstraction; no `DATABASE_POOL_MAX`/CA-loading; no backup/restore script. These
were not implemented in this session and are reported honestly above.

## 13. Acceptance-matrix changes

File: `docs/uat/acceptance-matrix.md` (updated this phase).

| Row | Before | After | Note |
|-----|--------|-------|------|
| US-L-01 registration | PARTIAL (blocked on keys) | PARTIAL | Clerk dev instance integrated; sign-up renders; real browser sign-up remains |
| US-L-02 email verification | BLOCKED | PARTIAL | dev instance live; completed by a real sign-up; deployed delivery still B-EMAIL |
| US-L-03 login/dashboard | PARTIAL | PARTIAL | sign-in renders; `/dashboard` 307→`/sign-in` verified |
| US-L-05 password reset | BLOCKED | BLOCKED/PARTIAL | Clerk-hosted; reachable once keys live; not exercised |
| US-L-06 profile editing | PARTIAL | PARTIAL | sync path tested; real Clerk profile edit not exercised |
| US-A-17 server-side admin denial | PASS | PASS | reaffirmed: `/admin` 307→sign-in + `access.test.ts` |
| US-A-03 banner (storage) | PARTIAL | PARTIAL | schema keys present; storage provider NOT IMPLEMENTED (B-B2) |
| Certificate PDF storage/download | PARTIAL | PARTIAL | PDF rendered on demand; not persisted to storage |
| OLX original-archive storage | PARTIAL | PARTIAL | archiveObjectKey column present; no storage writer |

Kept BLOCKED/PARTIAL (no external evidence): US-L-04 historical migration,
legacy-password migration, production email delivery, real B2, real RDS/RDS Proxy,
Amplify UAT deploy, US-A-16 UAT→PROD promotion.

## 14. Remaining blockers

A. **Code defects**: none blocking. Low-priority: email normalization; migration-runner TLS parity with the pool.

B. **Missing tests**: Clerk webhook signed-fixture test; Playwright E2E journeys; (storage tests — depend on B).

C. **Missing credentials/access**:
- `CLERK_WEBHOOK_SIGNING_SECRET` + webhook relay — needed to prove the webhook (blocks webhook verification; UAT).
- Backblaze B2 UAT keys — blocks storage provider work + US-A-03 (UAT/Prod).
- AWS UAT identity / RDS / RDS Proxy / Secrets Manager — blocks real DB + deploy (UAT/Prod).
- Production Clerk instance — blocks prod cutover (Prod).

D. **Missing source data**: Open edX relational export + Clerk mapping strategy — blocks US-L-04 (UAT/Prod).

E. **Stakeholder decisions**: whether to add username auth; final banner rules; legacy URL/redirect inventory.

F. **Cloud deployment work**: Amplify Gen 2 app + branch, RDS/Proxy provisioning, secrets wiring, migrations against RDS.

## 15. Exact recommended next step

Complete a **real browser sign-up** at `http://localhost:3000` (start `npm run dev`,
click **Sign up**) to close the first real account journey and exercise Clerk email
verification, then promote that account with
`node --experimental-strip-types scripts/admin/promote.mts <your-email>` and
confirm `/admin` loads. This is the smallest action that converts US-L-01/L-02/L-03
from PARTIAL toward PASS and is entirely local (no cloud/credentials required).

---

## Evidence table

| Area | Status | Evidence | Remaining gap |
|------|--------|----------|---------------|
| Git / no secrets | PASS | HEAD `12f70c1`, clean tree, `.env.local` ignored, no `sk_`/`whsec_` tracked | — |
| Clerk keys + link | PASS | `clerk doctor` green; keys configured | webhook secret missing |
| Clerk auth-method config | NOT TESTED | not queried via API/browser | verify instance settings |
| User sync (role integrity) | PASS | `access.test.ts` role-preservation | real event untested |
| Email normalization | NOT IMPLEMENTED | code inspection | add trim/lowercase |
| Admin denial routing | PASS | `/admin` 307→`/sign-in` (dev server) | — |
| Real sign-up journey | NOT TESTED | — | user browser action |
| Clerk webhook | NOT TESTED | code + signature guard | signed fixture / relay |
| Local storage provider | NOT IMPLEMENTED | no source files | build provider + tests |
| Local PostgreSQL 16 | PASS | `16.14`, 78 tests, idempotent migrate | — |
| RDS / RDS Proxy | NOT TESTED | design-ready (conn-string) | real connection |
| DATABASE_POOL_MAX / CA load | NOT IMPLEMENTED | `pool.ts` hardcoded max, no CA | add env + CA loader |
| Backup/restore | NOT IMPLEMENTED | doc-only | pg_dump + restore test |
| npm run verify | PASS | exit 0; 13 files / 78 tests / 0 fail; build 34 routes | — |
| Playwright | NOT IMPLEMENTED | none configured | add E2E suite |
| Architecture (11 tables) | PASS | `pg_tables` = frozen set | — |

**Snapshot**: commit `12f70c1` · branch `main` · pushed (origin == local) ·
working tree clean · tests 13 files / **78 passed / 0 failed / 0 skipped** ·
production build **success (34 routes)**.

> This report line for the commit SHA is updated below if saving/committing this
> file produces a new commit.

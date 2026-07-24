# Codex Final Review — Handoff

**This branch has NOT been merged. Codex has NOT been invoked. No deployment was triggered.**

## What to review

| | |
|---|---|
| **Comparison base** | `docs/database-uml-and-live-migration` |
| **Review target** | `origin/review/final-pre-codex-hardening` |
| **Obtain the exact target SHA** | `git rev-parse origin/review/final-pre-codex-hardening` |
| **Evidence report** | [`final-pre-codex-hardening-report.md`](final-pre-codex-hardening-report.md) |

Suggested diff:

```bash
git fetch origin
git diff docs/database-uml-and-live-migration...origin/review/final-pre-codex-hardening
```

The base already contains the full remediation branch
(`fix/codex-mandatory-remediation`, `8e36e6d`) plus three reviewed documentation
commits; `git merge-base --is-ancestor` was verified.

## Architecture invariants (must hold — do not "fix" by changing these)

- **Tables: 11 core + 1 supporting (`account_deletion_requests`) + 1 operational
  (`schema_migrations`) = 13.** No table may be added, removed or renamed.
- **Migrations `001`–`005` are frozen** and unchanged on this branch.
- Relational core + **versioned JSON content**; no ORM. No `assets`,
  `organisations`, `sections`/`units`/`questions` tables; no `content_nodes`,
  `parent_enrollment_id`, or `programme_enrollment_items`.
- Roles are `learner` / `admin`; **`app_users.role` is the authorization source** —
  browser and Clerk metadata can never elevate it.
- Draft content is not public; published is public; hidden denies learner content
  access while preserving enrolments, progress, attempts, grades and certificates;
  unhide restores the same enrolment and assigned revision.
- Published/retired credential revisions are **immutable**; existing learners stay on
  their assigned revision.
- `content_document` is learner-facing; **`grading_document` is server-only** and must
  never reach a learner response, log, prop or error.
- **One MCQ attempt**; certificate issuance is server-side and **idempotent**.
- Programme registration creates or reuses credential enrolments; programme progress
  uses the immutable registration snapshot.
- Maintenance mode is database-controlled (no redeploy).
- File bytes stay out of PostgreSQL; the database stores **provider-neutral logical
  object keys** only.
- Account deactivation denies protected access but preserves historical learning and
  certificate records.

## High-risk areas — please probe these hardest

1. **Dependency gate semantics** (`scripts/security/auditPolicy.ts`). Newly rewritten.
   An exception must allow exactly one GHSA on one package. Try to construct an audit
   payload that is wrongly suppressed — especially via the `transitivelyAffects` path.
2. **Deactivated-account boundary** across every protected surface, including
   admin-role holders and private downloads.
3. **Account-deletion resolution** — self-approval, admin-target, non-pending, and
   repeated resolution must all be rejected.
4. **Content-asset authorization** — key must be referenced by the learner's *exact
   assigned revision* of a published credential.
5. **OLX import** — archive safety, DOCTYPE/ENTITY rejection, storage compensation on
   failure (only operation-owned keys deleted), DB rollback.
6. **Progress / programme aggregation** — canonical calculation shared by dashboard,
   analytics and CSV; shared credential counted once; snapshot immutability.
7. **CSV injection** — neutralisation before RFC-4180 quoting, including leading
   Unicode whitespace/control characters.
8. **Caching/headers** — no learner-specific or hidden/draft response publicly cached.

## Known dependency exception (do not report as a clean audit)

- **`sharp < 0.35`, GHSA-f88m-g3jw-g9cj (high)**, reached only transitively through
  `next`. `next@15.5.21` (current pin, latest stable 15.5.x) still declares
  `optionalDependencies.sharp ^0.34.3`; npm's only offered "fix" is a **downgrade** to
  `next@14.2.35`.
- **Not reachable in this build:** no application module imports `sharp`, and
  `components/CatalogueCards.tsx` sets `unoptimized={img.startsWith("/media/")}` so
  untrusted user media bypasses Next's image optimizer entirely.
- Machine-readable, time-boxed: `security/audit-exceptions.json`, **expires
  2026-08-21** (or first cloud UAT, whichever is sooner).
- `npm run security:audit:raw` **remains non-zero (exit 1)** and is reported as such.
  The exception-aware gate passing is *not* a clean production audit.
- Also present: `fast-xml-parser` XMLBuilder advisory (moderate, below the high gate).
  `XMLBuilder` has **0 occurrences** in the tree — if it ever becomes reachable, this
  must fail review.

## Acceptance source of truth

`docs/uat/acceptance-matrix.md`, with `docs/uat/known-blockers.md`. These remain
**BLOCKED / PARTIAL** and must not be reported as complete:

historical Open edX migration (**BLOCKED**) · real deployed Clerk webhook (**PARTIAL**) ·
literal reset-link parity (**PARTIAL**) · Backblaze B2 (**BLOCKED**) · RDS / RDS Proxy
(**BLOCKED**) · Amplify cloud UAT (**BLOCKED**) · cross-environment UAT→Production
promotion (**BLOCKED**) · unsupported XBlock breadth (**PARTIAL**).

## Test commands (all executed green on this branch)

```bash
npm run format:check
npm run lint
npm run typecheck
npx vitest run --no-file-parallelism     # 39 files, 275 tests
npm run test:e2e                          # 17 passed  (parity)
npm run test:e2e:auth                     # 24 passed  (authenticated)
npm run build
npm run security:audit:raw                # EXPECTED non-zero while the exception stands
npm run security:audit                    # exception-aware gate
npm run db:backup
npm run db:restore:verify
npm run db:seed:ui                        # idempotent; run twice to confirm
```

Environment: Node v24.13.1 · npm 11.8.0 · PostgreSQL 16.14 · migrations 5 · tables 13 ·
`maintenance_mode = false`.

Note: do **not** run `npm run test:e2e` while a dev server is running — that suite
starts its own dev server sharing `.next` and the contention causes `ChunkLoadError`.
`npm run test:e2e:auth` is isolated (it builds into `.next-e2e-auth`).

## Not claimed

Cloud-UAT readiness · Production readiness · a clean raw dependency audit ·
completed historical migration · final approval.

---

## SUPERSEDED — delta review target (2026-07-24)

The review of `review/final-pre-codex-hardening` returned **GO WITH MANDATORY
FIXES**. Those fixes are on a new branch, which is now the review target:

| | |
|---|---|
| **Delta review target** | `origin/fix/final-codex-mandatory-fixes` |
| **Obtain the exact SHA** | `git rev-parse origin/fix/final-codex-mandatory-fixes` |
| **Compare against** | `review/final-pre-codex-hardening` (`0f12bdd`) |
| **Evidence** | [final-codex-mandatory-fixes-report.md](final-codex-mandatory-fixes-report.md) |

```bash
git fetch origin
git diff review/final-pre-codex-hardening...origin/fix/final-codex-mandatory-fixes
```

This is a **narrow** delta review covering only:

- **FCX-P0-001** — test-auth now requires the RAW `APP_ENV` to be exactly `test`.
  Probe: any variant (`TEST`, ` test`, `test\n`, `testing`, missing) enabling the
  adapter, or any entry point that does not independently fail closed.
- **FCX-P1-002** — the MCQ answer key no longer reaches learners. Probe: any
  learner query, DTO, RSC payload, prop, class, attribute or response that
  identifies a correct option; confirm `grading_snapshot` is still stored and
  still drives grading/certificate eligibility server-side.
- **FCX-P1-003** — the dependency exception gate. Probe: any audit payload that
  is wrongly suppressed — especially a bare transitive `via` string, a new GHSA
  on an excepted package, version/path drift, a critical, an expired exception,
  or a non-local/cloud environment.
- **FCX-P3-004** — contact email normalisation.

The architecture invariants, acceptance source of truth and BLOCKED/PARTIAL items
above are unchanged.

**Dependency status is unchanged in substance:** `sharp@0.34.5`
(GHSA-f88m-g3jw-g9cj) remains accepted under exception
`EX-SHARP-LIBVIPS-2026-07`, expiring **2026-08-21T00:00:00.000Z**.
`npm run security:audit:raw` still exits **non-zero**, and the local gate is not
a clean production audit. Cloud UAT and Production remain blocked — now
**machine-enforced** by the gate (raw `APP_ENV` must be exactly `local`/`test`
and no deployment marker may be present).

Neither branch has been merged. Codex was not invoked by the implementer.

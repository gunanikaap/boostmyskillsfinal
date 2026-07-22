# Codex Mandatory Remediation Report

Independent Codex review of `cleanup/code-quality-pass` @ `42bad67` (baseline
`main` @ `7edf1f7`) returned **"GO WITH MANDATORY FIXES"**. This report records
the implementation of every accepted fix on branch
`fix/codex-mandatory-remediation`. Contains no secrets or private data.

## Provenance

| Item | Value |
|---|---|
| Baseline `main` (untouched) | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` |
| Reviewed branch / SHA | `cleanup/code-quality-pass` @ `42bad67` |
| Remediation branch | `fix/codex-mandatory-remediation` (from the reviewed SHA) |
| Merge status | **NOT merged.** `main` was not modified, rebased, amended, reset, or force-pushed. |
| Codex during this phase | **Not invoked.** (Re-review is a separate, later step.) |
| Migrations | `001`–`005` unchanged; no application table added or removed. |
| Secrets | none committed; `.env*` gitignored; the E2E secret is generated per run in-process. |

## Mandatory fixes

| ID | Finding (summary) | Resolution | Tests | Commit |
|---|---|---|---|---|
| **AUTH-P1-001** | A deletion-approved (`deactivated_at` set) account could still reach protected surfaces. | `requireAuthenticatedUser` throws for deactivated; new `getActiveAppUser()`; maintenance-bypass + admin guards require `!deactivated`; dashboard/learn/certificates redirect to `/account`; cert-PDF route 401s. Identity sync never clears `deactivated_at`. | `deactivation.test.ts` (6) | `de3ed2c` |
| **Account-deletion policy** | Approval path under-verified. | `requestAccountDeletion` targets active learners only; `approveDeletionRequest` locks + re-verifies (no self-approve, learner-only target, active-admin resolver) with a guarded `UPDATE … WHERE deactivated_at IS NULL AND role='learner'`; reason/note bounded; `reject` transactional. | `account-deletion.test.ts` (10) | `5f46163` |
| **CSV-P2-001** | CSV formula-injection handling was local/incomplete. | Central `lib/export/csv.ts`: neutralises `= + - @` (incl. after skippable control/format runs) + RFC-4180 quoting; analytics export uses it. | `csv.test.ts` (6) | `312dcb5` |
| **ASSET-P2-002** | Content-asset route not bound to the caller's assigned revision. | `/content-asset/[...key]` validates credential/revision UUIDs, requires the key to be referenced by that exact revision, and (learners) an enrolment on that revision; admin preview allowed; `private, no-store`. | `content-asset.test.ts` (9) | `b22366e` |
| **OLX-P2-003** | Failed OLX import left orphaned storage objects. | Injectable `StorageProvider`; a failed import deletes only self-written keys (never caller-owned), best-effort, logging op-id + counts; rethrows the original error. | `olx-compensation.test.ts` (4) | `6ce8019` |
| **OPS-P2-004** | `db:restore:verify` picked a backup by filename order. | `selectBackupFile`: explicit path > `.last-backup` handoff (inside dir) > newest by mtime; `db:backup` writes the handoff pointer. | `select-backup.test.ts` (7) | `d40b8b8` |
| **P2 Playwright** | Authenticated suite could not execute end to end (stale selectors + `next dev` memory exhaustion). | Rewrote the product vertical for the redesigned UI (one-unit-per-page player, flip-state enrol/register, `.dash-card`, required Organisation, CSV header); harness now builds + serves a **production** bundle in an isolated `.next-e2e-auth` distDir. | `test:e2e:auth` → **24/24** (0 skipped, 0 not-run) | `a5a2968` |
| **P3 caching** | Private downloads lacked no-store. | `private, no-store` on the certificate PDF, OLX export (grading), analytics CSV; content-asset + `/media` admin-preview already set it. | `private-download-headers.test.ts` (4) + e2e | `798c0d7` |
| **P3 sanitiser** | URL control-char stripping used a literal-control-byte regex (unreviewable). | Rewrote to an explicit code-point filter (0x00–0x1F, 0x7F, `\s`) — identical behaviour, ASCII source. | `sanitize.test.ts` (15) | `0346553` |
| **Dependencies** | fast-xml-parser advisory (unused XMLBuilder) + sharp/next HIGH. | fast-xml-parser `processEntities:false` + pre-parse DOCTYPE/ENTITY rejection (`parseXml`). sharp/next: machine-readable **expiring** exception + exception-aware `security:audit` gate + `security:audit:raw`. | `olx.test.ts` entity hardening (3) | `4006547` |

## Dependency advisory determination (sharp / next)

`sharp < 0.35` (GHSA-f88m-g3jw-g9cj, HIGH; CVE-2026-33327/33328/35590/35591) is
pulled in **transitively by `next@15.5.20`**. npm's only offered remediation is a
**downgrade** to `next@14.2.35` (breaking + older); no forward stable Next on the
15.x line yet declares `sharp>=0.35`. `sharp` is used only by Next's optional
build-time image optimiser; BMS serves all images through the controlled `/media`
route and never transcodes untrusted image bytes at runtime. Therefore it is
**risk-accepted via a time-boxed, machine-readable exception**
(`security/audit-exceptions.json`, expires **2026-08-21** or first cloud UAT,
whichever is sooner). The release gate `npm run security:audit` is exception-aware
and **fails on any unexpected OR expired** high/critical advisory;
`npm run security:audit:raw` prints the unfiltered `npm audit`.

## Gate results (executed evidence)

- `npm run verify` → **ALL STEPS PASSED**: `format:check` · `lint` · `typecheck`
  · `security:audit` (2 time-boxed exceptions in effect, 0 unexpected) ·
  **256 Vitest tests / 37 files passed** (real PostgreSQL, `--no-file-parallelism`)
  · `next build` compiled successfully.
- `npm run test:e2e:auth` → **24/24 passed** (6 authorization + the 18-step
  product vertical); **zero failed, zero skipped, zero not-run**. Served from a
  production build (isolated distDir), flat memory profile.
- `npm run security:audit` → passes with the two suppressed (sharp, next)
  advisories reported; `security:audit:raw` shows them unfiltered.

## Out of scope / deferred (documented, not silently dropped)

- **fast-xml-parser major upgrade (5.x)** — the moderate advisory affects only the
  unused XMLBuilder path; the parser we use is additionally hardened. Deferred to a
  dependency-upgrade pass to avoid OLX-parser behavioural risk.
- **Next bump for sharp≥0.35** — no forward stable release available yet; tracked
  by the expiring exception above.
- **Real Clerk-session E2E, cloud/UAT deployment, B2/RDS integration** — external
  blockers (see `docs/uat/known-blockers.md`); unchanged by this phase.

## Statement

Mandatory remediation branch is ready for final independent Codex delta review.

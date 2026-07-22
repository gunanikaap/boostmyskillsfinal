# Known Blockers (external dependencies)

These are genuine external blockers: missing credentials, data, or third-party
decisions. Everything not blocked has been implemented and tested locally.

| ID | Blocker | Impact | What is needed | Owner |
|----|---------|--------|----------------|-------|
| B-CLERK | **RESOLVED for local/dev (auth flows manually proven)** — Clerk **development** instance linked (app `app_3G87KrNbe7G1khZGOgJX8C5Jfy4`, "Boost My Skills") via the Clerk CLI; `pk_`/`sk_` dev keys in local `.env.local` (gitignored). Manually completed against the Development instance: **real sign-up, email verification, email login, username login, profile synchronisation to `app_users`, and password reset (Development email-code method)**. `clerk doctor` green; protected routes redirect to `/sign-in`. **Still PARTIAL / external**: (a) **real deployed webhook delivery** of `user.*` events (endpoint + `CLERK_WEBHOOK_SIGNING_SECRET` in a deployed env) — signed-fixture tested only; (b) a separate **production** Clerk instance for prod cutover. | Wire a deployed webhook endpoint + secret; provision prod instance | Client / project owner |
| B-CLERK-E2E | **PARTIAL** — a fully **Clerk-session** automated browser click-through is not wired. Role enforcement AND the full admin+learner product journey are proven end to end through a real browser by the **test-auth** authenticated vertical (`npm run test:e2e:auth`, `tests/e2e-auth/`, **24 tests**: 6 authz + the 18-step product vertical — author→publish→enrol→play→certificate→hide/unhide→maintenance→analytics/CSV→OLX). It now builds and serves a **production** bundle (isolated `.next-e2e-auth` distDir) rather than `next dev`, so the long serial run has a flat memory profile. The adapter is secret-gated and unreachable outside `APP_ENV=test` (`tests/unit/test-auth-adapter.test.ts`). Real Clerk auth is otherwise evidenced manually (US-L-01/03/06, US-A-17). | Install `@clerk/testing`, wire `clerkSetup`/testing tokens against the dev instance with isolated test users (no real admin account, no committed tokens/browser state) | Project owner / QA |
| B-EMAIL | **Clerk Development email flow proven locally** (verification + reset codes delivered by the Clerk Development instance during manual auth testing). **NOT proven**: Production/UAT email delivery configuration (custom domain/sender, deliverability, templates, notifications beyond Clerk's dev sender). | Configure + verify Production/UAT email delivery (Clerk prod instance / provider) | Client |
| B-B2 | No Backblaze B2 UAT bucket / keys | Banner uploads, private OLX archive storage, certificate PDF persistence to object storage | UAT bucket + `B2_*` credentials (separate from Production) | Client / infra |
| B-DEPLOY | No confirmed UAT AWS identity / Amplify app / RDS / RDS Proxy / Secrets Manager | Real UAT deployment, RDS-Proxy DB, UAT→Prod promotion | Confirmed UAT AWS account, IAM permissions, Amplify Gen 2 app + branch, RDS + Proxy, Secrets Manager entries | Infra / cloud owner |
| B-MIGRATE | No real Open edX relational export | Historical learner/enrolment/progress/grade/certificate migration (US-L-04) | Source LMS export files + agreed field mapping | Client / data owner |
| B-REDIRECTS | No legacy URL inventory | Full historical course/programme redirect map | Real legacy URL → new slug mapping data | Client |

## What is NOT blocked (done + verified locally)

- The full frozen 11-table schema, constraints, and transactions (real Postgres tests).
- Publish transaction, immutable revisions, hide/unhide, 20-step hidden lifecycle.
- Server-side authorization (`requireAdmin` + access functions), test-auth adapter
  that cannot activate outside `APP_ENV=test`.
- MCQ server-side grading, one-attempt policy, idempotent double-submit, grading secrecy.
- Idempotent certificate issuance + PDF rendering + public verification (approved fields only).
- OLX archive-safety (traversal/link/size protections) + import→draft + export round trip.
- Analytics + CSV export. Maintenance mode (server-side). SEO (sitemap/robots).
- Migration dry-run + idempotent upsert (reports UNAVAILABLE, never fabricates).

## Interpretation

A local adapter/test proves **implementation readiness**, not external acceptance.
None of the blocked items above are reported as deployed, integrated, or migrated.

## Resolved this phase (not a blocker)

- **Framework RSC advisories**: `next` upgraded `15.2.3 → 15.5.20` (minor, not
  Next 16), `react`/`react-dom` pinned exact `19.2.7`, `postcss` overridden
  `>=8.5.10` (cleared the original 1 critical + multiple high). One documented,
  non-exploitable moderate remains (`fast-xml-parser` XMLBuilder — not used).
  See `docs/security/security-review.md` and
  `docs/uat/framework-security-and-auth-completion-report.md`.

## Dependency advisory — risk-accepted, time-boxed (not a blocker)

- **`sharp < 0.35` libvips advisory** (GHSA-f88m-g3jw-g9cj, HIGH; CVE-2026-33327/
  33328/35590/35591) is pulled in **transitively by `next@15.5.20`**. npm's only
  offered remediation is a **downgrade** to `next@14.2.35` (breaking + older), and
  no forward stable Next on the 15.x line yet declares `sharp>=0.35`. `sharp` is
  used only by Next's optional build-time image optimiser; BMS serves all images
  through the controlled `/media` route and never transcodes untrusted image bytes
  at runtime. Risk-accepted via a machine-readable **expiring** exception
  (`security/audit-exceptions.json`, expires **2026-08-21** or first cloud UAT,
  whichever is sooner). Re-pin Next as soon as a release bumps `sharp>=0.35`.
  Gates: `npm run security:audit` (exception-aware — fails on any unexpected OR
  expired high/critical); `npm run security:audit:raw` (unfiltered `npm audit`).

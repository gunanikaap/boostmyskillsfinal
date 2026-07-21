# Known Blockers (external dependencies)

These are genuine external blockers: missing credentials, data, or third-party
decisions. Everything not blocked has been implemented and tested locally.

| ID | Blocker | Impact | What is needed | Owner |
|----|---------|--------|----------------|-------|
| B-CLERK | **RESOLVED for local/dev (auth flows manually proven)** — Clerk **development** instance linked (app `app_3G87KrNbe7G1khZGOgJX8C5Jfy4`, "Boost My Skills") via the Clerk CLI; `pk_`/`sk_` dev keys in local `.env.local` (gitignored). Manually completed against the Development instance: **real sign-up, email verification, email login, username login, profile synchronisation to `app_users`, and password reset (Development email-code method)**. `clerk doctor` green; protected routes redirect to `/sign-in`. **Still PARTIAL / external**: (a) **real deployed webhook delivery** of `user.*` events (endpoint + `CLERK_WEBHOOK_SIGNING_SECRET` in a deployed env) — signed-fixture tested only; (b) a separate **production** Clerk instance for prod cutover. | Wire a deployed webhook endpoint + secret; provision prod instance | Client / project owner |
| B-CLERK-E2E | **PARTIAL** — a fully **Clerk-session** automated browser click-through of the authenticated admin+learner journey is not wired. Role enforcement IS proven end to end through a real browser by the **test-auth** authenticated vertical (`npm run test:e2e:auth`, `tests/e2e-auth/`, 6 tests): admin/learner/anon `/admin` + `/dashboard`, and a forged header without the run secret cannot become admin. That adapter is secret-gated and unreachable outside `APP_ENV=test` (unit-proven in `tests/unit/test-auth-adapter.test.ts`). Real Clerk auth is otherwise evidenced manually (US-L-01/03/06, US-A-17). | Install `@clerk/testing`, wire `clerkSetup`/testing tokens against the dev instance with isolated test users (no real admin account, no committed tokens/browser state) | Project owner / QA |
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
  `>=8.5.10`. Production `npm audit --omit=dev`: **0 critical / 0 high** (was 1
  critical + multiple high). One documented, non-exploitable moderate remains
  (`fast-xml-parser` XMLBuilder — XMLBuilder is not used). Release gate:
  `npm run security:audit`. See `docs/security/security-review.md` and
  `docs/uat/framework-security-and-auth-completion-report.md`.

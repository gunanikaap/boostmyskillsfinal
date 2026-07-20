# Known Blockers (external dependencies)

These are genuine external blockers: missing credentials, data, or third-party
decisions. Everything not blocked has been implemented and tested locally.

| ID | Blocker | Impact | What is needed | Owner |
|----|---------|--------|----------------|-------|
| B-CLERK | **RESOLVED for local/dev** — Clerk **development** instance linked (app `app_3G87KrNbe7G1khZGOgJX8C5Jfy4`, "Boost My Skills") via the Clerk CLI; `pk_`/`sk_` dev keys in local `.env.local` (gitignored). Verified: `clerk doctor` green, sign-in/sign-up pages render Clerk, protected routes redirect to `/sign-in`, header shows Sign in/Sign up/UserButton. **Still needed**: (a) a real learner completes sign-up in the browser (user action) to close US-L-01/02; (b) `CLERK_WEBHOOK_SIGNING_SECRET` + webhook endpoint wired in a deployed env for user sync; (c) a separate **production** Clerk instance for prod cutover. | Complete a browser sign-up; add webhook secret in UAT; provision prod instance | Client / project owner |
| B-EMAIL | No email delivery configured | Email verification / notifications | Clerk email settings (part of B-CLERK) | Client |
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

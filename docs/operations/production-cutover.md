# Production Cutover

> STATUS: procedure only. Do NOT modify or deploy Production without explicit
> owner sign-off. This repository never touches Production resources.

## Preconditions

- UAT signed off against `docs/uat/acceptance-matrix.md`.
- All blockers in `docs/uat/known-blockers.md` resolved with real evidence.
- Production Clerk instance, B2 Production bucket, RDS + Proxy, and Secrets
  Manager entries exist and are owner-approved.

## Cutover steps

1. Freeze content changes in UAT.
2. Provision/confirm Production Secrets (separate from UAT).
3. Snapshot the Production DB, then run `npm run db:migrate` against it through
   the RDS Proxy — the runner is forward-only and idempotent.
4. Promote content via OLX export (UAT) then import (Production) as drafts;
   publish after review. (Cross-env promotion is currently blocked — B-DEPLOY.)
5. Configure the Production Clerk webhook to `/api/webhooks/clerk`.
6. Deploy the production branch via Amplify; verify build + smoke checklist.
7. Enable redirects (`data/redirects.json`) once the legacy URL inventory exists.

## Rollback

See `backup-and-rollback.md`. Migrations are additive; prefer forward fixes over
destructive rollback. Never use `git reset --hard` or force-push shared branches.

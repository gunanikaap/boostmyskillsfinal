# UAT Deployment Runbook

> STATUS: prepared, NOT executed. UAT cloud deployment is externally blocked
> (B-DEPLOY): a confirmed UAT AWS identity, Amplify Gen 2 app, RDS + RDS Proxy,
> and Secrets Manager entries are required. Nothing here modifies Production.

## Target architecture (UAT, isolated from Production)
- **Hosting**: AWS Amplify Gen 2 app + a dedicated `uat` branch.
- **Database**: RDS PostgreSQL (private subnets) reached ONLY via RDS Proxy.
- **Secrets**: AWS Secrets Manager (DB URL, Clerk keys, B2 keys) — never in repo.
- **Storage**: Backblaze B2 UAT bucket (separate from Production).
- **Auth**: a dedicated UAT Clerk instance.

## Pre-flight (must all be true before applying anything)
1. `aws sts get-caller-identity` confirms the **UAT** account, not Production.
2. IAM permissions for Amplify/RDS/Secrets already exist (no blind provisioning).
3. Cost tags + budget confirmed; no expensive NAT design added without review.

## Steps
1. Create Secrets Manager entries: `DATABASE_URL` (RDS Proxy endpoint, `sslmode=require`),
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `CLERK_WEBHOOK_SIGNING_SECRET`, `B2_*`.
2. Configure Amplify env vars from Secrets; set `APP_ENV=uat`,
   `NEXT_PUBLIC_SITE_URL=https://<uat-domain>`, `DATABASE_SSL=true`.
3. Run migrations against the UAT DB (through the Proxy):
   `DATABASE_URL=... npm run db:migrate` then `npm run db:seed`.
4. Configure the Clerk webhook → `/api/webhooks/clerk`.
5. Deploy the `uat` branch via Amplify. Verify the production build succeeds
   (locally proven: `npm run build`).
6. Smoke test with `docs/uat/manual-smoke-checklist.md`.

## Environment isolation invariants
- No Production data or secrets in UAT.
- Separate B2 bucket/prefix and Clerk instance from Production.
- `APP_ENV` is never `test` in UAT (test-auth adapter stays inert).

Report the exact missing IAM action/secret/resource if any step cannot complete.
Do NOT report UAT as deployed until step 6 passes against real infrastructure.

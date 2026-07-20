# BoostMySkills

Micro-credential and micro-programme LMS (UAT build).

**Stack:** Next.js (App Router) + TypeScript · SQL-first PostgreSQL via `pg` · Clerk auth ·
Backblaze B2 (S3-compatible) object storage · Open edX OLX (.tar.gz) exchange ·
AWS Amplify Gen 2 hosting · AWS RDS PostgreSQL through RDS Proxy.

> This repository is the **canonical implementation** (`boostmyskillsfinal`). It is a fresh,
> SQL-first build against the frozen eleven-table data architecture. It deliberately does **not**
> reuse the reference repository's legacy `content_nodes`/`content_links` schema or its local
> auth/storage routes. See `docs/architecture/` for details.

## Quick start (local development)

```bash
# 1. Install dependencies
npm install

# 2. Start a local PostgreSQL (host port 5433; see docker-compose.yml)
npm run db:up

# 3. Copy env template and fill in local values
cp .env.example .env.local

# 4. Apply migrations and seed
npm run db:migrate
npm run db:seed

# 5. Run the app
npm run dev
```

## Verification

```bash
npm run verify   # format check → lint → typecheck → unit + DB tests → production build
```

Database tests require a reachable PostgreSQL (`TEST_DATABASE_URL`). They exercise real
relational constraints and transactions — they are **not** mocked.

## Documentation

- `docs/architecture/` — data model, content contract, access rules, hidden-content behaviour
- `docs/security/security-review.md`
- `docs/operations/` — local development, UAT deployment, production cutover, backup & rollback
- `docs/migration/migration-readiness.md`
- `docs/uat/` — acceptance matrix, manual smoke checklist, known blockers

## Environments

`local` · `test` · `uat` · `production` — isolated databases, buckets and Clerk instances per
environment. No real secrets live in this repository; see `.env.example` for variable names only.

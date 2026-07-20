# Local Development

## Prerequisites
Node ≥ 20.11, Docker (for local PostgreSQL), npm.

## Setup
```bash
npm install
npm run db:up               # starts postgres:16 on host port 5433
cp .env.example .env.local  # local values (no real secrets)
npm run db:migrate
npm run db:seed
npm run dev                 # http://localhost:3000
```

> Port 5433 is used because a native PostgreSQL often occupies 5432. If you use a
> pre-existing container, create an isolated `bms`/`bms_test` database + role.

## Verify
```bash
npm run verify   # format:check → lint → typecheck → tests → production build
npm test         # tests only (needs TEST_DATABASE_URL reachable)
```

## Admin bootstrap
Sign in once, then:
```bash
node --experimental-strip-types scripts/admin/promote.mts you@example.com
```

## Auth without Clerk keys
The app builds and runs without Clerk keys (ClerkProvider + middleware are
guarded). Auth-gated pages show a "not configured" notice. For automated tests,
the test-auth adapter is used (`APP_ENV=test`, `TEST_AUTH_ENABLED=true`).

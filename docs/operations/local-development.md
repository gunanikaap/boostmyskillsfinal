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
APP_ENV=local npm run verify   # format:check → lint → typecheck → audit → tests → build
npm test                       # tests only (needs a MARKED isolated test database)
```

## Isolated test database (required for all DB-backed tests)

Automated tests never touch the application database. They fail closed unless
**all** of the following hold, so a misconfigured run modifies nothing:

- raw `APP_ENV` is exactly `test`;
- `TEST_DATABASE_URL` is set (it is **never** inferred from `DATABASE_URL`);
- the database name is a dedicated `<name>_test` database (e.g. `bms_test`) — not
  `bms`, `postgres`, a production-ish name, or anything merely containing "test";
- the database carries the persistent marker `boostmyskills:test-only:v1`
  (stored as a `COMMENT ON DATABASE`, so it survives `DROP SCHEMA`);
- the connected database is provably distinct from `DATABASE_URL` — compared on
  the server's own identity (cluster start time + database OID), so host aliases
  (`localhost` / `127.0.0.1` / `::1` / Docker names) or a different username
  cannot disguise the same database.

**One-time provisioning** of the marker (the test runner never creates it):

```bash
APP_ENV=test TEST_DATABASE_URL=<your isolated *_test url> npm run db:test:mark
# → prints "Isolated test database marker verified." and nothing else
```

Then, if the test database has no schema yet:

```bash
APP_ENV=test TEST_DATABASE_URL=<...> npm run db:migrate -- --test
```

`db:reset --test` and `db:migrate --test` run the full guard (exact `APP_ENV`,
marker, strict name, connected-identity check) before any destructive statement,
and re-verify the marker afterwards. There is no bypass flag.

## Admin bootstrap
Sign in once, then:
```bash
node --experimental-strip-types scripts/admin/promote.mts you@example.com
```

## Auth without Clerk keys
The app builds and runs without Clerk keys (ClerkProvider + middleware are
guarded). Auth-gated pages show a "not configured" notice. For automated tests,
the test-auth adapter is used (`APP_ENV=test`, `TEST_AUTH_ENABLED=true`).

# Final Test-Database Marker & CLI-Guard — Evidence Report

**Generated:** 2026-07-24
**Remediation branch:** `fix/final-test-db-marker-cli-guards`
**Branched from (reviewed SHA):** `a9098af79b99bd20bec53e0e56542957b70ea9ac`
(`fix/final-test-database-isolation`)
**Delta comparison base:** `fix/final-test-database-isolation`

> Every figure below was produced by an executed command. **Codex was not
> invoked. Nothing was merged. The raw dependency audit is NOT clean and is not
> claimed to be.** No URLs, hostnames, usernames, passwords or personal data
> appear below.

---

## 1. Verified starting state

| Ref | SHA | Note |
|---|---|---|
| `fix/final-test-database-isolation` | `a9098af79b99bd20bec53e0e56542957b70ea9ac` | matches reviewed SHA |
| `origin/fix/final-test-database-isolation` | `a9098af79b99bd20bec53e0e56542957b70ea9ac` | remote matches |
| `fix/final-codex-mandatory-fixes` | `8eee86f41e7032603aa7ca03a8bc8f2e66d28ff6` | untouched |
| `main` / `origin/main` | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` | untouched |

Working tree clean; no merge/rebase/cherry-pick/revert in progress; `git diff
--check` clean.

## 2. TDX-P1-001 — test CLIs did not run the full guard

**Root cause.** `db:reset --test` could reach `DROP SCHEMA public CASCADE`, and
`db:migrate --test` its DDL, having only checked presence of `TEST_DATABASE_URL`
— not the full connected guard — and the environment check tolerated normalized
`APP_ENV` variants.

**Fix.** Both `--test` paths now:
- require raw `APP_ENV === "test"` (no lowercase/trim);
- invoke `assertSafeTestDatabaseTarget()` — the **complete** guard — before
  creating any destructive client, DROP, CREATE, migration or seed;
- operate only on the verified target (`VerifiedTestTarget.connectionString()`),
  never a re-read env var or `DATABASE_URL`;
- re-verify the marker **after** the operation (reset checks post-`DROP SCHEMA`,
  before migrating; migrate checks post-migration) and stop with a safe non-zero
  error if it is missing.

Ordinary (non-`--test`) reset/migrate behaviour is unchanged and cannot silently
enter test mode.

### Executed CLI evidence

| Scenario | Result |
|---|---|
| `db:reset --test`, `APP_ENV=TEST` | rejected: *"requires APP_ENV to be exactly 'test'"* — no DROP |
| `db:reset --test` → application database | rejected by same-target check — no DROP |
| `db:migrate --test` → strict-named but **UNMARKED** db | rejected: *"not marked … `npm run db:test:mark`"* **before any DDL**; database left with no `schema_migrations` table (`untouched: t`) |
| `db:reset --test` → UNMARKED db | rejected before `DROP SCHEMA` |

## 3. TDX-P1-002 — URL comparison alone cannot prove isolation

**Root cause.** Comparing URL components misses `localhost` vs `127.0.0.1` vs
`::1`, Docker/DNS aliases, a different username, and the case where `DATABASE_URL`
is missing while `TEST_DATABASE_URL` accidentally points at the application
database.

**Fix — two independent identity requirements plus a server-reported comparison:**

### A. Strict test-database NAME rule (`isStrictTestDatabaseName`)
A dedicated `<name>_test` database. **Rejected:** `bms`, `boostmyskills`,
`boostmyskills_local`, `postgres`, `template0/1`, `production`, `uat`, `staging`,
`live`, `main`, a bare `test`, `_test`, `testing`, `my_test_database`,
`production_test`/`uat_test`/`staging_test`, upper-case, hyphenated, and
over-length names.

### B. Persistent database MARKER
Exactly `boostmyskills:test-only:v1`, stored with `COMMENT ON DATABASE` (lives in
`pg_shdescription`). **Verified live that it survives `DROP SCHEMA public
CASCADE`.** The test runner requires it and never creates or repairs it.

### C. Connected-identity comparison (`isSameConnectedDatabase`)
Decided on the server's own report — `pg_postmaster_start_time()` (cluster
identity) plus the database OID — **not** the URL, so the same database is
detected however it was addressed. `inet_server_addr()/port()` are supplementary
only (NULL over a unix socket). **Username is deliberately not part of the
decision.**

### Connected identity fields obtained (internal only, never logged)
`current_database()` · database OID from `pg_database` ·
`pg_postmaster_start_time()` · `inet_server_addr()` · `inet_server_port()` ·
`shobj_description(oid,'pg_database')` (the marker). The application connection is
opened **read-only** (`default_transaction_read_only = on`) with a short
connection/statement timeout.

### Guard contract order
exact `APP_ENV=test` → `TEST_DATABASE_URL` required → parse → strict name → parse
`DATABASE_URL` when present → reject identical canonical URL → connect to test →
verify `current_database` + strict name + marker → connect **read-only** to the
application target when present → compare connected identities → return an opaque
`VerifiedTestTarget`. Callers cannot fabricate that result (module-private brand
symbol); the verified connection string is exposed only from it.

### Executed alias / marker evidence (live, against the real `bms_test`)

| Case | Result |
|---|---|
| marked `*_test`, correct config | **accepted** (returns `VerifiedTestTarget`) |
| `DATABASE_URL` at the SAME db via a different host spelling | **rejected**: *"SAME database … same PostgreSQL server"* |
| strict-named but UNMARKED db | **rejected**: marker read null, *"not marked"* |
| `localhost` / `127.0.0.1` / `::1` / IPv4-vs-IPv6, same cluster + OID | detected as same database |
| different OID on same cluster; different cluster | detected as different |

## 4. `DATABASE_URL`-missing safety

When `DATABASE_URL` is absent the test database still proceeds only when the
independent properties pass: exact `APP_ENV=test`, `TEST_DATABASE_URL` present and
valid, `current_database()` matches the parsed name, the name satisfies the strict
rule, and the marker equals `boostmyskills:test-only:v1`. This prevents
`TEST_DATABASE_URL` pointing at `bms`, `postgres`, or any unmarked ordinary
database. `DATABASE_URL` is **not** required to run isolated tests.

## 5. Marker provisioning (explicit, one-time)

`npm run db:test:mark` (`scripts/db/mark-test-db.mts`) is the **only** code path
that writes the marker. It requires exact `APP_ENV=test` and explicit
`TEST_DATABASE_URL` (no fallback), requires the strict name, rejects an obvious
same target, connects only to `TEST_DATABASE_URL`, verifies `current_database()`
before writing, verifies the marker after, and prints only *"Isolated test
database marker verified."* It is not invoked by `test:unit`, Vitest setup,
`test:e2e:auth`, `db:reset --test`, `db:migrate --test`, `build` or `verify`
(asserted by test).

## 6. Local test database provisioned & verified

The existing isolated test database `…_test` already satisfies the strict name
rule. The marker was applied once via `db:test:mark`, independently confirmed
present, confirmed to **survive `DROP SCHEMA public CASCADE`**, and migrations
were re-applied (5 files). The application database carries **no** marker
(confirmed). No database was renamed or deleted except a disposable
`guard_probe_test`/`scratch_test` created only to prove the unmarked-rejection
path.

## 7. Application-database preservation — all 13 tables

Counts captured from the application database **before** the automated suite,
**after** the full Vitest run, and **after** Vitest + both Playwright suites were
byte-for-byte identical (`diff` empty):

| Table | Before | After all tests |
|---|---|---|
| app_users | 4 | 4 |
| projects | 5 | 5 |
| micro_credentials | 15 | 15 |
| credential_versions | 15 | 15 |
| micro_programmes | 7 | 7 |
| programme_credentials | 13 | 13 |
| enrollments | 7 | 7 |
| unit_progress | 17 | 17 |
| assessment_attempts | 5 | 5 |
| certificates | 4 | 4 |
| platform_settings | 1 | 1 |
| account_deletion_requests | 1 | 1 |
| schema_migrations | 5 | 5 |

`maintenance_mode = false` (unchanged); migration count `5` (unchanged);
test-prefixed `external_ref` rows in the application database: `0` (unchanged); no
truncation occurred.

## 8. Complete quality gate — executed results

| Gate | Result |
|---|---|
| `format:check` | **pass** |
| `lint` | **pass** — 0 warnings, 0 errors |
| `typecheck` | **pass** (exit 0) |
| `test:unit` | **18 files, 295 tests, all pass** |
| `vitest run --no-file-parallelism` | **45 files, 448 tests, all pass, 0 failed, 0 skipped** |
| `test:e2e` (parity) | **17 passed**, 0 failed, 0 skipped |
| `test:e2e:auth` (authenticated) | **24 passed**, 0 failed, 0 skipped, 0 not-run |
| `build` | **succeeds** |
| `security:audit:raw` | **exit 1 — NON-ZERO** (unchanged) |
| `security:audit:local` (APP_ENV=local) | exit 0, prints *"This is NOT a clean audit"* |
| `npm audit --omit=dev --audit-level=high` | **exit 1 — NON-ZERO** |
| `db:backup` | **pass** |
| `db:restore:verify` | **pass** — 13 tables, migrations=5, key row counts match |
| Seed idempotence | **pass** — `5/15/7/15/4` before, after run 1, after run 2 |
| Tracked + staged secret scan | **clean** (only synthetic fixtures) |
| `git diff --check` | clean |

Vitest grew 404 → **448** (44 new marker/identity/alias/CLI tests).

## 9. Architecture integrity

- Migrations `001`–`005`: **unchanged**.
- Tables: **11 core + 1 supporting + 1 operational = 13**. None added, removed or
  renamed.
- `maintenance_mode = false`; no schema, business-rule or UI change.
- Environment: Node v24.13.1 · npm 11.8.0 · PostgreSQL 16.14.

## 10. Dependency status (unchanged)

`next@15.5.21`; the only accepted finding remains **GHSA-f88m-g3jw-g9cj** on
`sharp@0.34.5`, exception `EX-SHARP-LIBVIPS-2026-07`, expiring
**2026-08-21T00:00:00.000Z**. Raw audit remains non-zero. Cloud UAT and Production
remain blocked and machine-enforced.

## 11. Remaining external blockers (unchanged)

B-CLERK · B-CLERK-E2E · B-EMAIL · B-B2 · B-DEPLOY · B-MIGRATE · B-REDIRECTS.
Historical migration **BLOCKED**; deployed Clerk webhook **PARTIAL**; literal
reset-link parity **PARTIAL**; B2 **BLOCKED**; RDS/RDS Proxy **BLOCKED**; Amplify
cloud UAT **BLOCKED**; cross-environment promotion **BLOCKED**; unsupported XBlock
breadth **PARTIAL**.

## 12. Not claimed

Cloud-UAT readiness · Production readiness · a clean raw dependency audit ·
completed historical migration · final approval.

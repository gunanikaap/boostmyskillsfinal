# Final Test-Database Isolation — Evidence Report

**Generated:** 2026-07-24
**Remediation branch:** `fix/final-test-database-isolation`
**Branched from (reviewed SHA):** `8eee86f41e7032603aa7ca03a8bc8f2e66d28ff6`
(`fix/final-codex-mandatory-fixes`)
**Delta comparison base:** `fix/final-codex-mandatory-fixes`

> Every figure below was produced by an executed command. **Codex was not
> invoked. Nothing was merged. The raw dependency audit is NOT clean and is not
> claimed to be.**

---

## 1. Verified starting state

| Ref | SHA | Note |
|---|---|---|
| `fix/final-codex-mandatory-fixes` | `8eee86f41e7032603aa7ca03a8bc8f2e66d28ff6` | matches reviewed SHA |
| `origin/fix/final-codex-mandatory-fixes` | `8eee86f41e7032603aa7ca03a8bc8f2e66d28ff6` | remote matches |
| `review/final-pre-codex-hardening` | `0f12bdd95014ee80f556a4f29be2d57d8540435c` | untouched |
| `main` / `origin/main` | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` | untouched |

Working tree clean; no merge, rebase or cherry-pick in progress; `git diff --check`
clean.

## 2. FDX-P1-001 — root cause

Two fallbacks meant the destructive test helpers could target the developer's
database:

```ts
// tests/setup.ts and scripts/e2e/run-auth-e2e.mts
if (process.env.TEST_DATABASE_URL) { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL }

// lib/env.ts
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
```

With `TEST_DATABASE_URL` unset, `DATABASE_URL` silently remained the
local/manual-review database, and `tests/helpers/db.ts` then executed:

```sql
TRUNCATE certificates, assessment_attempts, unit_progress, enrollments,
         programme_credentials, credential_versions, micro_programmes,
         micro_credentials, projects, app_users
RESTART IDENTITY CASCADE
```

### Complete inventory of affected paths (§2)

| Path | Fallback | Destructive? |
|---|---|---|
| `lib/env.ts` `testDatabaseUrl()` | `?? DATABASE_URL` | feeds migrations |
| `tests/setup.ts` | conditional repoint | enables the truncate |
| `tests/helpers/db.ts` `resetDb()` | none, but **unguarded** | `TRUNCATE` ×10 tables |
| `scripts/e2e/run-auth-e2e.mts` | conditional repoint | seeds + truncates |
| `tests/e2e-auth/global-setup.ts` | trusted inherited `DATABASE_URL` | writes `app_users` |
| `scripts/db/reset.mts --test` | `?? DATABASE_URL` | `DROP SCHEMA public CASCADE` |
| `scripts/db/migrate.mts --test` | `?? DATABASE_URL` | migrates |

## 3. The fix — central fail-closed guard

New `lib/db/testGuard.ts` (server/test only):

| Function | Guarantee |
|---|---|
| `requireTestDatabaseUrl()` | `TEST_DATABASE_URL` mandatory; **no** fallback, hardcoded URL, Docker default or inference; syntax validated |
| `assertExactTestEnvironment()` | raw `process.env.APP_ENV === "test"` — no lowercase/trim/`NODE_ENV` substitute |
| `assertIsolatedTestTarget()` | the above **plus** the test target must be provably distinct from the application database |
| `assertSafeTestDatabaseTarget()` | the above **plus** a preflight connection verifying `current_database()` |
| `snapshotApplicationDatabaseUrl()` | captures the application URL before the repoint so distinctness stays provable |

**Same-target detection** compares a canonical fingerprint of `protocol · host ·
effective port · user · database`, deliberately **ignoring the password and all
query parameters**. Verified rejections:

| Disguise | Result |
|---|---|
| identical URL | REJECTED |
| different password | REJECTED |
| `?sslmode=require` added | REJECTED |
| reordered query parameters | REJECTED |
| omitted vs explicit `:5432` | REJECTED |
| `postgresql://` vs `postgres://` | REJECTED |
| invalid URL / wrong scheme | REJECTED |
| unparseable `DATABASE_URL` | REJECTED (isolation unprovable) |
| **genuinely isolated test DB** | **ALLOWED** |

**Environment matrix** (`APP_ENV`): `test` → allowed; `TEST`, `Test`, `local`,
`development`, `uat`, `staging`, `production`, `""`, missing → **all rejected**.

**No bypass exists.** There is no `ALLOW_UNSAFE_TEST_DATABASE`,
`FORCE_TEST_DATABASE` or `SKIP_TEST_DATABASE_GUARD`, and a test asserts the guard
source contains no such escape hatch and that setting one has no effect.

**No leakage.** No function returns, logs or embeds a URL, host, username or
password. A test asserts error messages contain none of them. The only log is
`"Resetting isolated test database."`

## 4. Guarded call sites (§4)

- `tests/setup.ts` — `TEST_DATABASE_URL` mandatory; the repoint is now
  **unconditional**; application URL snapshotted; isolation asserted before any
  suite opens a connection.
- `tests/helpers/db.ts` — **both** `ensureMigrated()` and `resetDb()` assert the
  safe target, so calling `resetDb()` directly cannot truncate the application
  database.
- `tests/e2e-auth/global-setup.ts` — asserts isolation and connects to
  `TEST_DATABASE_URL` explicitly rather than an inherited `DATABASE_URL`.
- `scripts/db/reset.mts` / `scripts/db/migrate.mts` — `--test` no longer falls
  back.

Ordinary application use of `DATABASE_URL` is unchanged.

## 5. Authenticated Playwright harness (§5)

`scripts/e2e/run-auth-e2e.mts` now performs the full preflight in the required
order — exact `APP_ENV` → `TEST_DATABASE_URL` present → valid syntax → distinct
from `DATABASE_URL` → preflight connection → `current_database()` verified —
**before** the Next build, before any server starts, and before migrations or
seeding.

Verified with `TEST_DATABASE_URL` pointed at the application database:

```
exit=1
mentions build? false
Refusing to run the authenticated E2E suite: TEST_DATABASE_URL must refer to an
isolated database: it resolves to the same host, port and database name as the
application DATABASE_URL. Refusing to run destructive test operations.
```

No build, no server, no connection using `DATABASE_URL`, no modification to
either database, and no credentials in the message.

## 6. Low-risk corrections

1. **`npm run test:unit` repaired.** `vitest --dir <path>` conflicted with the
   config's `include: ["tests/**/*.test.ts"]` — changing the root made the
   include match nothing, so the script exited 1 with "No test files found".
   Switched to a positional path filter. Verified: `test:unit` 17 files / 255
   tests; `test:db` 26 files / 149 tests.
2. **Learner copy corrected.** `app/learn/[credentialId]/page.tsx` still
   described loading "correct answers"; since FCX-P1-002 the answer key is never
   loaded for learners.
3. **Acceptance totals corrected** to the verified figures (404 Vitest / 43
   files, 17 auth-agnostic Playwright, 24 authenticated Playwright), plus a note
   that the suite requires an isolated `TEST_DATABASE_URL`. Historical reports
   keep their point-in-time figures.

## 7. Complete quality gate — executed results

| Gate | Result |
|---|---|
| `format:check` | **pass** |
| `lint` | **pass** — 0 warnings, 0 errors |
| `typecheck` | **pass** (exit 0) |
| `vitest run --no-file-parallelism` | **43 files, 404 tests, 404 passed, 0 failed, 0 skipped** |
| `test:unit` | 17 files, 255 tests (previously exited 1) |
| `test:db` | 26 files, 149 tests |
| `test:e2e` (parity) | **17 passed**, 0 failed, 0 skipped |
| `test:e2e:auth` (authenticated) | **24 passed**, 0 failed, 0 skipped, 0 not-run |
| `build` | **succeeds** |
| `security:audit:raw` | **exit 1 — NON-ZERO** (unchanged) |
| `security:audit:local` (APP_ENV=local) | exit 0, prints "This is NOT a clean audit" |
| `db:backup` | **pass** |
| `db:restore:verify` | **pass** — 13 tables, migrations=5, key row counts match |
| Seed idempotence | **pass** — `5/15/7/15/4` before, after run 1, after run 2 |
| Tracked + staged secret scan | **clean** (only synthetic fixtures) |
| `git diff --check` | clean |

Vitest grew 361 → **404** (43 new isolation regression tests).

**Direct proof of the fix:** after the complete test run, the application
database was unchanged at `5/15/7/15/4`
(projects/credentials/programmes/versions/users). Before this fix, a run without
`TEST_DATABASE_URL` would have truncated all of them.

## 8. Architecture integrity

- Migrations `001`–`005`: **unchanged**.
- Tables: **11 core + 1 supporting + 1 operational = 13**. None added, removed or
  renamed.
- `maintenance_mode = false`; no schema, business-rule or UI change.
- Environment: Node v24.13.1 · npm 11.8.0 · PostgreSQL 16.14.

## 9. Dependency status (unchanged)

`next@15.5.21`; the only accepted finding remains **GHSA-f88m-g3jw-g9cj** on
`sharp@0.34.5`, exception `EX-SHARP-LIBVIPS-2026-07`, expiring
**2026-08-21T00:00:00.000Z**. The raw audit remains non-zero. Cloud UAT and
Production remain blocked and machine-enforced.

## 10. Remaining external blockers (unchanged)

B-CLERK · B-CLERK-E2E · B-EMAIL · B-B2 · B-DEPLOY · B-MIGRATE · B-REDIRECTS.
Historical migration **BLOCKED**; deployed Clerk webhook **PARTIAL**; literal
reset-link parity **PARTIAL**; B2 **BLOCKED**; RDS/RDS Proxy **BLOCKED**; Amplify
cloud UAT **BLOCKED**; cross-environment promotion **BLOCKED**; unsupported XBlock
breadth **PARTIAL**.

## 11. Not claimed

Cloud-UAT readiness · Production readiness · a clean raw dependency audit ·
completed historical migration · final approval.

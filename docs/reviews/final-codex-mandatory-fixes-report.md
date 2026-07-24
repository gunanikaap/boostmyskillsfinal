# Final Codex Mandatory Fixes — Evidence Report

**Generated:** 2026-07-24
**Remediation branch:** `fix/final-codex-mandatory-fixes`
**Branched from (reviewed SHA):** `0f12bdd95014ee80f556a4f29be2d57d8540435c`
(`review/final-pre-codex-hardening`)
**Comparison base for the delta review:** `review/final-pre-codex-hardening`

> Every figure below was produced by an executed command. **Codex was not
> invoked. Nothing was merged. No cloud/UAT/Production action was taken. The raw
> dependency audit is NOT clean and is not claimed to be.**

---

## 1. Verified starting state

| Ref | SHA | Note |
|---|---|---|
| `review/final-pre-codex-hardening` | `0f12bdd95014ee80f556a4f29be2d57d8540435c` | matches reviewed SHA |
| `origin/review/final-pre-codex-hardening` | `0f12bdd95014ee80f556a4f29be2d57d8540435c` | remote matches |
| `main` | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` | untouched |
| `origin/main` | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` | untouched |

Working tree clean; no merge or rebase in progress; `git diff --check` clean.

## 2. Commits

| Commit | Subject |
|---|---|
| `61964e3` | fix(auth): require exact test environment (FCX-P0-001) |
| `81adaf4` | fix(assessment): remove answer keys from learner payloads (FCX-P1-002) |
| `e9bfa0e` | fix(security): narrow the dependency exception gate (FCX-P1-003) |
| `c5b661f` | fix(contact): normalize contact email before validation (FCX-P3-004) |
| `cbdf88a` | fix(security): require an explicitly declared environment for the audit gate |
| *(this commit)* | docs(review): record final Codex remediation evidence |

## 3. FCX-P0-001 — exact test environment (P0, FIXED)

**Root cause.** `lib/env.ts` normalised the environment with
`(process.env.APP_ENV ?? "local").toLowerCase()`. The test-auth boundary was
built on that helper, so `APP_ENV=TEST` resolved to `"test"` and could enable the
test-authentication adapter. A mis-cased deployment variable was sufficient.

**Fix.** New `isExactTestEnvironment()` compares the RAW value:

```ts
process.env.APP_ENV === "test"
```

No lower/upper-casing, no trim, no `startsWith`/`includes`, no permissive regex,
no `NODE_ENV` substitute, no default fallback. Every entry point gates on it
**independently** and fails closed:

| Entry point | Behaviour when the raw value is not exactly `test` |
|---|---|
| `env.testAuthEnabled()` | `false` (also now requires `TEST_AUTH_ENABLED === "true"` exactly) |
| `identity.setTestActor()` | throws |
| `identity.parseTestActorHeader()` | returns `null` before any secret comparison |
| `identity.resolveTestHeaderIdentity()` | returns `null` before reading headers |
| `identity.resolveExternalIdentity()` | falls through to real Clerk auth |

`appEnv()` still normalises for ordinary display/configuration — that is
deliberate and unchanged; `isTestEnv()` now delegates to the exact check so no
caller can obtain a laxer answer.

**Environment matrix** (`tests/unit/test-auth-env-matrix.test.ts`, 28 tests).
Allowed: **exactly `test`**. Rejected — and for each, `testAuthEnabled()` is
false, a correct-secret header cannot authenticate (including one claiming
`role=admin`), and `setTestActor()` throws:

`TEST` · `Test` · `tEsT` · `" test"` · `"test "` · `" test "` · `"test\n"` ·
`"test\t"` · `testing` · `local` · `development` · `dev` · `uat` · `staging` ·
`production` · `""` · missing · `"null"` · `"undefined"` · `tets`

**Production-build regression** included for `production`, `TEST` and missing.

**Live harness verification** (separate node processes, `TEST_AUTH_ENABLED=true`
and a secret set in every case):

```
APP_ENV=test        testAuthEnabled=true
APP_ENV=TEST        testAuthEnabled=false
APP_ENV=uat         testAuthEnabled=false
APP_ENV=production  testAuthEnabled=false
APP_ENV=MISSING     testAuthEnabled=false
```

Unchanged requirements: `TEST_AUTH_ENABLED=true`, exact server-only
`TEST_AUTH_SECRET`, valid actor, isolated test DB, and no trust in any
browser-supplied role.

## 4. FCX-P1-002 — answer keys removed from learner payloads (P1, FIXED)

**Root cause.** `lib/learner/queries.ts` selected
`assessment_attempts.grading_snapshot`, derived `correctByQuestion` from it, and
returned that map to learner-facing code. `UnitView` rendered it client-side with
✓/✗ marks, `mcq__option--correct` / `--wrong` classes and a "Correct" tag — so the
server-only answer key reached the browser of any learner who had submitted.

**Fix — query layer.** `grading_snapshot` is no longer selected at all. The
learner DTO is an explicit allowlist:

| Field | Purpose |
|---|---|
| `attemptNumber` | which attempt |
| `percentage` | learner's score |
| `score` / `maximumScore` | raw score |
| `passed` | pass/fail outcome |
| `submittedAt` | when submitted |
| `chosenByQuestion` | the learner's OWN selections (read-only display) |

Explicitly **absent**: `grading_snapshot`, `gradingSnapshot`, `grading_document`,
`gradingDocument`, `correctByQuestion`, `correctOptionIds`, per-option
correctness flags, internal grading rules.

**Fix — UI.** The submitted view shows score, pass mark, passed/not-passed, the
one-attempt message, and marks only the learner's own selection ("Your answer").
It never identifies which unselected option was correct. Correctness CSS was
removed in favour of a neutral `mcq__option--chosen`, so no class, colour, mark,
tag, aria-label or data attribute reveals the key.

**Retained server-side.** `grading_snapshot` is NOT deleted from PostgreSQL. It
remains the immutable historical grading record and still drives grading and
certificate eligibility.

**Leakage evidence** (`tests/db/assessment-answer-key-privacy.test.ts`, 9 tests):
initial content payload, post-submission review, reloaded review and unit-state
payload all free of the six forbidden tokens; the DTO exposes exactly the seven
allowlisted keys; the learner still sees score, pass/fail, attempt number and
their own answers; one-attempt state preserved (second submit rejected, still one
row); `grading_snapshot` still present in the database with the key. The decisive
check: **after a WRONG answer the correct option id appears nowhere** in the
learner payload.

End-to-end, the authenticated Playwright vertical now asserts the
**post-submission** served HTML/RSC payload (the exact path that leaked) contains
none of the forbidden tokens, renders no correct/wrong markup or "Correct" tag,
and still shows "Your answer" and the pass mark.

## 5. FCX-P1-003 — dependency exception gate rebuilt (P1, FIXED)

**Root cause.** The gate could suppress a transitive `via` string without fully
checking expiry, criticality, installed version, dependency path or environment.

**Exception schema** (`security/audit-exceptions.json`) — every field is bound
and machine-enforced:

| Field | Value (verified from `npm ls` + audit JSON) |
|---|---|
| `id` | `EX-SHARP-LIBVIPS-2026-07` |
| `ghsa` | `GHSA-f88m-g3jw-g9cj` |
| `package` | `sharp` |
| `installedVersion` | **`0.34.5`** (verified, not assumed) |
| `vulnerableRange` | `<0.35.0` |
| `severity` | `high` |
| `dependencyPaths` | `["node_modules/sharp"]` |
| `transitiveParents` | `next@15.5.21` at `["node_modules/next"]` |
| `expiresUtc` | **`2026-08-21T00:00:00.000Z`** |
| `allowedEnvironments` | `["local","test"]` |
| `blockedMilestone` | first cloud UAT |
| `productionProhibited` | `true` |

**Rules enforced.** A bare transitive `via` string is never accepted alone — it is
resolved to the underlying advisory object(s), and the affected package must be a
declared transitive parent with its own exact version and paths. Allowance
requires an exact match on GHSA, package, installed version, dependency-path set,
severity and range. Criticals are rejected **before** exception processing and can
never be excepted (an exception may not even be authored with `severity:
"critical"`).

**Environment enforcement.** Uses the RAW `APP_ENV` (consistent with
FCX-P0-001) and reads only the real process environment — no `.env` fallback, no
default, never hardcoded to `local` in the script. Exceptions apply only under
exactly `local` or `test`, and never when any of `AWS_BRANCH`, `AWS_APP_ID`,
`AMPLIFY_APP_ID`, `AMPLIFY_ENV`, `AWS_EXECUTION_ENV`, `CODEBUILD_BUILD_ID` is
non-empty.

**Expiry.** Explicit UTC instant with an injectable clock; at or after it, fail.
Tested one second before, at the exact instant, one second after, invalid,
missing, and UTC-vs-local-date.

**Fail-closed.** npm exec failure, empty stdout, invalid JSON, missing
`vulnerabilities`, malformed advisory entries, unresolvable/cyclic advisories,
malformed or duplicate exceptions, package not installed, version drift, path
drift.

**Truthful output.** On success it prints `RAW AUDIT IS NOT CLEAN — findings
below are ACCEPTED, not fixed`, the exception id, advisory, `package@version`,
range, dependency path, parent, allowed environments, UTC expiry, and
`CLOUD UAT: BLOCKED` / `PRODUCTION: BLOCKED`. It never prints "0 vulnerabilities"
and never describes itself as a clean audit. `npm run security:audit:raw` is
unchanged; `npm run security:audit:local` added as an unambiguous alias.

**Live environment matrix** (exit codes):

```
APP_ENV=local       0      APP_ENV=uat          1
APP_ENV=test        0      APP_ENV=staging      1
                           APP_ENV=production   1
                           APP_ENV=TEST         1
                           APP_ENV=Local        1
                           APP_ENV=development  1
                           APP_ENV MISSING      1
                           APP_ENV=local + AWS_BRANCH=main   1
```

Tests: `tests/unit/audit-policy.test.ts` (52).

## 6. FCX-P3-004 — contact email normalisation (P3, FIXED)

Normalised (trim + lowercase) via a Zod `preprocess` **before** validation, so the
normalised value is what is format-checked, length-capped (254) and persisted. It
reuses the central `normalizeEmail()` from `lib/auth/normalize.ts` — the same
helper used for identity sync — rather than a second divergent rule. No migration
(contact submissions are files under the local storage root, not a database
table). The admin listing remains authorized and bounded.

Tests: `tests/unit/contact-route.test.ts` (9) — mixed case lowercased, whitespace
trimmed, both together, valid address unchanged, values invalid once normalised
rejected, over-length rejected after normalisation, unexpected fields rejected,
malformed JSON rejected, and the response body is only `{ok:true}` (it does not
echo the stored email or message).

## 7. Complete quality gate — executed results

| Gate | Result |
|---|---|
| `format:check` | **pass** |
| `lint` | **pass** — 0 warnings, 0 errors |
| `typecheck` | **pass** (exit 0) |
| `vitest run --no-file-parallelism` | **42 files, 361 tests, 361 passed, 0 failed, 0 skipped** |
| `test:e2e` (parity) | **17 passed**, 0 failed, 0 skipped |
| `test:e2e:auth` (authenticated) | **24 passed**, 0 failed, 0 skipped, 0 not-run |
| `build` | **succeeds** |
| `security:audit:raw` | **exit 1 — NON-ZERO** (3: 1 moderate, 2 high) |
| `npm audit --omit=dev --audit-level=high` | **exit 1 — NON-ZERO** |
| `security:audit:local` (APP_ENV=local) | exit 0, prints "RAW AUDIT IS NOT CLEAN" + full exception detail |
| `db:backup` | **pass** |
| `db:restore:verify` | **pass** — 13 tables, migrations=5, key row counts match |
| Seed idempotence | **pass** — `5/15/7/15/4` before, after run 1, after run 2 |
| Tracked + staged secret scan | **clean** |
| `git diff --check` | clean |

Vitest grew from 275 → **361** (86 new regression tests across the four findings).

## 8. Architecture integrity

- Migrations `001`–`005`: **unchanged**.
- Tables: **11 core + 1 supporting (`account_deletion_requests`) + 1 operational
  (`schema_migrations`) = 13**. None added, removed or renamed.
- `maintenance_mode = false`.
- No schema, index, ORM, infrastructure or public-UI redesign.
- Environment: Node v24.13.1 · npm 11.8.0 · PostgreSQL 16.14.

## 9. Dependency status

`next` is pinned at **15.5.21** (latest stable 15.5.x). The only accepted finding
is **GHSA-f88m-g3jw-g9cj** on `sharp@0.34.5`, reached transitively through
`next`. No forward stable Next release resolves it (15.5.21 still declares
`optionalDependencies.sharp ^0.34.3`); npm's only remediation is a downgrade to
`next@14.2.35`.

**Not reachable:** no application module imports `sharp`, and
`components/CatalogueCards.tsx` sets `unoptimized={img.startsWith("/media/")}`, so
untrusted user media bypasses Next's image optimizer — only repo-committed brand
assets are optimized.

Also present: `fast-xml-parser` XMLBuilder advisory (moderate, below the high
gate). `XMLBuilder` has **0 occurrences**; only `XMLParser` is used, with
`processEntities:false` and DOCTYPE/ENTITY rejection.

**The raw audit remains non-zero and is reported as non-zero. The local
exception-aware gate is not a clean production audit. Cloud UAT and Production
remain blocked — now machine-enforced.**

## 10. Remaining external blockers (unchanged)

B-CLERK (deployed webhook + production instance) · B-CLERK-E2E (real Clerk browser
automation) · B-EMAIL (production delivery) · B-B2 (Backblaze bucket/keys) ·
B-DEPLOY (AWS/Amplify/RDS/RDS Proxy) · B-MIGRATE (historical Open edX export) ·
B-REDIRECTS (legacy URL inventory).

Acceptance items unchanged: historical migration **BLOCKED**; deployed Clerk
webhook **PARTIAL**; literal reset-link parity **PARTIAL**; B2 **BLOCKED**;
RDS/RDS Proxy **BLOCKED**; Amplify cloud UAT **BLOCKED**; cross-environment
promotion **BLOCKED**; unsupported XBlock breadth **PARTIAL**.

## 11. Not claimed

Cloud-UAT readiness · Production readiness · a clean raw dependency audit ·
completed historical migration · final approval.

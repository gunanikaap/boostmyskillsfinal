# Final Pre-Codex Hardening — Evidence Report

**Generated:** 2026-07-23
**Review branch:** `review/final-pre-codex-hardening`
**Comparison base:** `docs/database-uml-and-live-migration`

> Every figure below was produced by an executed command in this phase. Nothing
> is claimed as passing that was not run. **No migration has been executed, no
> cloud/UAT/Production action was taken, and Codex was not invoked.**

---

## 1. Starting state (verified, not assumed)

| Ref | SHA | Note |
|---|---|---|
| `main` | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` | unchanged throughout |
| `origin/main` | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` | unchanged |
| `fix/codex-mandatory-remediation` | `8e36e6dc1a3f7fbfc0a929a5c399b8a08720bdb8` | matches expected |
| `docs/database-uml-and-live-migration` | `c542506407cb000a9b8cefffa9050f3e31be0e25` | matches expected |
| `ui/motion-and-focus-polish` | `bee0580a248cbdf5c47770f2f4f00cc4b0ffa41d` | accessibility/motion work |

`git merge-base --is-ancestor fix/codex-mandatory-remediation docs/database-uml-and-live-migration`
**passed** — the documentation branch fully contains the remediation branch and adds
only three reviewed documentation commits. It was therefore used as the starting
point, per the preferred path.

**Deviation (declared):** the review branch also carries `bee0580`
(`style(ui): motion and keyboard-focus polish`) by cherry-pick. Section 23 requires
fixing "missing keyboard focus"; that commit is the fix (the stylesheet previously
had **zero** `:focus-visible` rules) and was already gated green. It is
presentation-only CSS — no markup, copy, component or behaviour change.

## 2. Deployment-trigger check (§2)

No deployment would be triggered by pushing this branch:

- `.github/workflows/**` — **does not exist**
- `amplify.yml`, `amplify/**` — **do not exist**
- no `vercel.json`, `netlify.toml`, `Dockerfile`, `fly.toml`, `render.yaml`
- only `docker-compose.yml` (local Postgres, marked *"NEVER used for UAT or Production"*)
- `docs/operations/uat-deployment.md` is marked **"prepared, NOT executed"**; cloud UAT
  remains externally blocked (B-DEPLOY)

No AWS, Amplify, RDS, RDS Proxy or B2 operation was performed.

## 3. Environment

| Item | Value |
|---|---|
| Node | v24.13.1 |
| npm | 11.8.0 |
| PostgreSQL | 16.14 (Debian) |
| Migrations applied | 5 (`001`…`005`) |
| Public tables | 13 |
| maintenance_mode | `false` |

## 4. Findings and disposition

### P0 — Critical
**None found.** No authentication/authorization bypass, grading exposure, SQL
injection, XSS sink without sanitisation, path traversal, secret exposure, or
duplicate certificate/attempt/enrolment was identified.

### P1 — High (all fixed)

**P1-1 — Eight unpatched `next` advisories, three HIGH.**
`next@15.5.20` had gained, since the previous phase:

| Advisory | Severity | Issue |
|---|---|---|
| GHSA-m99w-x7hq-7vfj | high | DoS in App Router via Server Actions |
| GHSA-89xv-2m56-2m9x | high | SSRF in Server Actions on custom routes |
| GHSA-p9j2-gv94-2wf4 | high | SSRF in rewrites via attacker-controlled hostname |
| GHSA-68g3-v927-f742 / GHSA-4633-3j49-mh5q | moderate | cache confusion of response bodies |
| GHSA-4c39-4ccg-62r3 | moderate | unbounded Server Action payload (Edge) |
| GHSA-q8wf-6r8g-63ch | moderate | image-optimization DoS via SVG |
| GHSA-955p-x3mx-jcvp | moderate | unauthenticated disclosure of internal Server Function endpoints |

Directly reachable — every admin mutation in this app is a Server Action.
**Fixed:** pinned `next` 15.5.20 → **15.5.21** (latest *stable* 15.5.x patch; not a
canary/prerelease; same minor) and `eslint-config-next` to match. All eight clear.

**P1-2 — The dependency exception gate silently suppressed them.**
The exception matched by **package name**, so any future advisory on `next`/`sharp`
was auto-muted — the precise failure mode §20 forbids. The gate returned exit 0
while eight advisories were outstanding.
**Fixed:** policy extracted to `scripts/security/auditPolicy.ts` and rewritten so an
exception allows **one advisory (exact GHSA) on one package**, with an explicit
`transitivelyAffects` list. New advisories fail; criticals can never be excepted;
expiry fails; a GHSA declared for a different package fails.

### P2 — Medium (fixed)

**P2-1 — Unbounded read over a publicly-writable store.** `/api/contact` is public
and unauthenticated (correctly: no privileged action, no session read, strict
length-capped Zod validation — CSRF is not meaningful there). But
`listSubmissions()` read **every** stored file into memory, so spam would degrade
the admin page without limit. Now bounded: filenames carry an ISO-timestamp prefix,
so the newest N are chosen by name *before* any file is read
(`CONTACT_LIST_LIMIT = 500`).

**P2-2 — Incomplete test-auth environment matrix.** §10 requires all five
environments. The gate test omitted `development` and never asserted the second
gate. The *implementation* was already correct (`APP_ENV==="test"` **AND**
`TEST_AUTH_ENABLED==="true"`); this closed the proof gap.

### P3 — Low (fixed)

**P3-1 — `SELECT *` in `createDraftFromPublished`.** Fetched every column while the
INSERT used ten explicitly. Replaced with the explicit list so a future column
surfaces rather than being silently fetched and dropped. No behaviour change.

### Deferred (documented, not fixed)

| Finding | Severity | Rationale / owner |
|---|---|---|
| `sharp < 0.35` libvips advisory (GHSA-f88m-g3jw-g9cj) | high | No forward fix exists: `next@15.5.21` still declares `optionalDependencies.sharp ^0.34.3`; npm's only "fix" is a **downgrade** to `next@14.2.35`. Not reachable (see §6). Time-boxed exception, expires **2026-08-21**. Owner: project owner. Blocking milestone: **first cloud UAT**. |
| `fast-xml-parser` XMLBuilder advisory (GHSA-gh4j-gqv2-49f6) | moderate | `XMLBuilder` has **0 occurrences** in the tree (verified); only `XMLParser` is used, with `processEntities:false` and DOCTYPE/ENTITY rejection. Below the high gate. |
| In-app rate limiting for `/api/contact` | P2 (deferred) | Infrastructure concern (WAF/ALB), consistent with the existing security review. Abuse impact now bounded by P2-1. Owner: infra. Blocking milestone: cloud UAT. |

## 5. Re-verification of previous remediations (§6)

| # | Item | Evidence |
|---|---|---|
| A | Deactivated-account protection | `tests/db/deactivation.test.ts` + e2e |
| B | Account-deletion policy | `tests/db/account-deletion.test.ts` |
| C | CSV formula injection | `tests/unit/csv.test.ts` |
| D | Content-asset revision authz | `tests/db/content-asset.test.ts` |
| E | OLX storage compensation | `tests/db/olx-compensation.test.ts` |
| F | Backup selection by mtime | `tests/unit/select-backup.test.ts`; restore-verify selected the *freshly created* dump |
| G | Authenticated Playwright | 24/24, zero skipped, zero not-run |
| H | Private cache headers | `tests/db/private-download-headers.test.ts` |
| I | Sanitizer reviewability | 0 control bytes; git `text: auto`; `file` → "JavaScript source, Unicode text, UTF-8 text" |
| J | XML hardening | `processEntities:false`, DOCTYPE/ENTITY rejected, **XMLBuilder 0 occurrences** |
| K | Dependency exception | **Defect found and fixed** — see P1-2 |

## 6. Security review summary

- **Authorization:** all **18** admin server actions call `requireAdmin`; learner
  actions (`account`, `courses`, `learn`, `programs`) use `requireAuthenticatedUser`,
  which rejects deactivated accounts. Every route handler is guarded
  (`requireAdmin` / user auth / webhook signature / public-banner policy);
  `/api/contact` is intentionally public.
- **Test-auth:** double-gated; `setTestActor()` throws outside `APP_ENV=test`; no
  `NEXT_PUBLIC` path can enable it; full five-environment matrix now tested.
- **XSS:** four `dangerouslySetInnerHTML` sinks, all rendering server-sanitised
  content (about/reading HTML sanitised at write). No `eval`, `new Function`,
  `child_process`, `debugger`, `@ts-ignore`, `console.log` in `app/components/lib`.
- **Storage/sharp reachability:** no application module imports `sharp`;
  `components/CatalogueCards.tsx` sets `unoptimized={img.startsWith("/media/")}`, so
  **untrusted user image bytes never reach the optimizer** — only repo-committed
  brand assets are optimized. This is the basis of the exception.
- **Secrets:** tracked scan clean. The only matches are synthetic, obviously-fake
  connection strings inside `tests/unit/db-config.test.ts`, which exist precisely to
  assert that credentials are never logged. No `.env` file is tracked except
  `.env.example`; no uploads, database dumps, browser auth state or `test-results/`
  are tracked.
- **Production smoke test** (built server, port 3200): public routes 200;
  `/dashboard`, `/admin`, `/account`, `/account/certificates` → **307 to sign-in**;
  `/admin/analytics/export` and certificate download deny anonymous;
  `/content-asset/...` → 404; sitemap 23 URLs with **0** draft/hidden mentions;
  baseline headers present (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`,
  `Permissions-Policy`, and `private, no-store` on the private surface).

## 7. Final quality gate — executed results

| Gate | Result |
|---|---|
| `format:check` | **pass** |
| `lint` | **pass** — 0 warnings, 0 errors |
| `typecheck` | **pass** (exit 0) |
| `vitest run --no-file-parallelism` | **39 files, 275 tests, 275 passed, 0 failed, 0 skipped** |
| `test:e2e` (parity) | **17 passed**, 0 failed, 0 skipped |
| `test:e2e:auth` (authenticated) | **24 passed**, 0 failed, 0 skipped, 0 not-run |
| `build` | **succeeds** — 50 route entries |
| `security:audit:raw` | **exit 1 — NON-ZERO (3: 1 moderate, 2 high)** |
| `security:audit` (exception-aware) | **exit 0**, 2 findings suppressed via one GHSA |
| `db:backup` | **pass** — dump written |
| `db:restore:verify` | **pass** — 13 tables, migrations=5, key row counts match |
| Seed idempotence | **pass** — 5/15/7/15 before, after 1st, after 2nd |
| `git diff --check` | clean |

Baseline before this phase was 37 files / 256 tests; the 19 added tests are the
regression cover for the findings above.

> **The raw dependency audit is NOT clean and is not claimed to be.** It remains
> non-zero while the sharp exception is in effect. The exception-aware gate passing
> is not a clean production audit.

## 8. Architecture integrity

- Migrations `001`–`005`: **unchanged** (`git diff` over `db/migrations/` is empty).
- Tables: **11 core + 1 supporting (`account_deletion_requests`) + 1 operational
  (`schema_migrations`) = 13**. No table added, removed or renamed; no `CREATE/DROP/
  ALTER TABLE` anywhere in the branch diff.
- No ORM, no new infrastructure, no schema/index change, no public-UI redesign.

## 9. Remaining external blockers (unchanged)

B-CLERK (deployed webhook + production instance) · B-CLERK-E2E (real Clerk browser
automation) · B-EMAIL (production delivery) · B-B2 (Backblaze bucket/keys) ·
B-DEPLOY (AWS/Amplify/RDS/RDS Proxy) · B-MIGRATE (historical Open edX export) ·
B-REDIRECTS (legacy URL inventory). Cloud UAT remains **blocked** while the sharp
exception is in effect.

## 10. Files changed on this branch

`app/globals.css` (a11y/motion, cherry-picked) · `lib/contact/store.ts` ·
`lib/credentials/service.ts` · `package.json` · `package-lock.json` ·
`scripts/security/audit.mts` · **new** `scripts/security/auditPolicy.ts` ·
`security/audit-exceptions.json` · **new** `tests/unit/audit-policy.test.ts` ·
**new** `tests/unit/contact-store.test.ts` · `tests/unit/test-auth-adapter.test.ts`.

**Files removed:** none (no dead code met the §7 proof-of-non-use bar).
**Dependencies changed:** `next` 15.5.20 → 15.5.21; `eslint-config-next` 15.5.20 → 15.5.21.

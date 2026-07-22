# Code Cleaning & Security-Hardening Report

> Delivery SHA: obtain from `git rev-parse HEAD` on branch
> `cleanup/code-quality-pass` (this report intentionally does not embed its own
> final commit SHA). Contains no secrets or private data.

## 1–5. Provenance

| Item | Value |
|---|---|
| Baseline main SHA | `098269259b0a757a9f88719461c701c3a99341d2` (before the freeze merge) |
| Verified main SHA (branch base) | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` |
| Cleanup branch | `cleanup/code-quality-pass` |
| Cleanup starting SHA | `7edf1f7729ae3892a5dafd19cc7ec1bd548e26a1` |
| Commits created (this phase) | `4109bd3 fix(security): sanitize builder reading HTML, guard CSV, add security headers` + this docs commit |

The branch already existed from the freeze phase, was clean, and based on the
current `origin/main`, so cleanup continued on it (branch-rule A). Main was not
modified. The reference remote was not touched.

## 6–9. Scope of review

The codebase entered this phase already well-tested (189 vitest + 17 auth-agnostic
Playwright) and security-conscious (archive-safety suite, server-only grading,
double-gated test-auth, parameterised SQL, storage-key validation). The pass was
therefore **targeted at genuine defects and high-value hardening**, not churn.

Files reviewed: all of `app/`, `lib/`, `components/`, `middleware.ts`,
`next.config.mjs`, `db/migrations/`, `scripts/`, and the test tree (~16k LOC).
Anti-pattern scan (console.log/debug, `@ts-ignore`, `eval`, `new Function`,
`child_process`, `SELECT *`, `dangerouslySetInnerHTML`, TODO/FIXME/HACK,
hardcoded paths/secrets) across app/lib/components returned a **clean tree**:
no console noise, no ts-ignore, no eval/child_process, no TODO/FIXME/HACK.

## 10–13. Findings by severity

**P0 (critical): 0 found.** No authorization bypass, grading leak, secret
exposure, path traversal, XSS-to-learner, SQL injection, duplicate
certificate/attempt/enrolment, hidden-content access, or maintenance bypass was
found. (Each was actively checked — see §16–24 below.)

**P1 (high): 0 found.**

**P2 (medium): 3 found, 3 fixed.**

| # | File | Issue | Fix | Test |
|---|---|---|---|---|
| P2-1 | `lib/credentials/service.ts` (saveDraft) | Reading-unit HTML authored in the **visual builder** was stored in `content_document` without sanitisation (About/OLX/seed paths already sanitised) and later rendered to learners via `dangerouslySetInnerHTML` — a stored-XSS gap (admin-authored, learner-facing). | New `sanitizeContentDocumentHtml()` sanitises every reading unit's HTML on ingest in `saveDraft`. | `tests/unit/content.test.ts` (script/handler/js-url stripped; non-reading untouched; malformed no-op) |
| P2-2 | `lib/admin/analytics.ts` (`analyticsToCsv`) | CSV export did RFC-4180 quoting but **no spreadsheet formula-injection guard**; user-controlled learner/organisation names flow into cells. | Cells starting with `= + - @ tab CR` are prefixed with `'` so they render as literal text. | `tests/db/analytics.test.ts` (`=HYPERLINK`, `+`, `@`, `-` payloads neutralised) |
| P2-3 | `next.config.mjs` | No baseline HTTP security headers. | Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/interest-cohort off), `X-DNS-Prefetch-Control: off`. Verified live via `next start`. | Verified with `curl -D-` on `/` and `/courses`. |

**P3 (low): documented, deferred** (see §27).

## 14. Defects fixed
The three P2 security items above. No functional/product-behaviour defects were
found (the merged feature work was already covered by the vitest suite and the
freeze-phase verification).

## 15. Security fixes
As P2-1/2/3. All are behaviour-preserving for benign content and additive.

## 16. Authorization review
- Every `/admin` page is gated by the `/admin` layout `requireAdmin()`, and every
  admin server action **independently** calls `requireAdmin()` (defence in depth —
  middleware is never the sole boundary).
- `role` is read only from `app_users` (never from the browser / Clerk metadata);
  `syncAppUser` preserves role on sync (unit + webhook tests cover this).
- `/content-asset/[...key]` (imported PDF assets) authorises via
  `requireCredentialContentAccess` (published + enrolled) OR `requireAdmin`, with
  the credential id parsed from the key path, never the caller.
- `/media/[...key]` serves only banner keys (published public; draft/hidden
  admin-only) and never OLX archives.
- Certificate download route enforces owner/admin; the public verification code is
  a `randomUUID` (no raw DB id, unguessable), exposing only approved snapshot fields.

## 17. Test-auth adapter review
`lib/auth/identity.ts` is double-gated: reachable only when `testAuthEnabled()`
(`APP_ENV === "test"`) **and** an exact `TEST_AUTH_SECRET` header match; no
`NEXT_PUBLIC_*` toggle, no cookie/query activation, no default/fallback secret;
malformed identity / invalid role / missing clerk id / invalid email all reject
(10 unit tests in `tests/unit/test-auth-adapter.test.ts`). No change needed.

## 18. Input / XSS review
Server-side sanitisation now covers **all** stored HTML ingest points: About
content, OLX reading imports, seed readings, and (new) builder reading HTML.
`sanitizeHtml` is an allowlist sanitiser that drops script/style/iframe/object/
embed with content, comments, event handlers, and `javascript:`/`data:` URLs.
Learner responses were confirmed to contain **no** `grading_document`,
`correctOptionIds`, or `grading_snapshot` (grading is server-only; `content_document`
carries no answer key — enforced by `assertNoGradingLeak` + tests).

## 19. SQL / transaction review
SQL is parameterised throughout; no dynamic concatenation of user input was found.
The single `SELECT *` (`createDraftFromPublished`) is a controlled, parameterised
row-copy (copying all columns to a new draft is intentional). Transactions wrap
publish, enrolment, programme registration/fan-out, progress, assessment (one-
attempt), certificate issuance, hide/unhide, maintenance, and OLX import; rollback
and connection release verified by existing suites. No schema/index change made.

## 20. Storage review
Provider-neutral storage boundary intact; DB stores logical keys only.
`assertValidKey` rejects traversal, absolute paths, Windows drive letters, null
bytes, and unsafe segments. Banner upload does structural image validation
(dims/decodability). No assets table introduced; B2 remains inactive.

## 21. OLX review
Import enforces compressed/expanded-size, file-count, per-file-size limits;
rejects traversal/absolute/drive-path/symlink/hardlink/device entries; skips
GNU/PAX long-name overrides; sanitises reading HTML; never auto-publishes; stores
the original archive privately with checksum + source metadata; on rejection the
transaction leaves no partial draft (14 archive-safety tests + import tests).

## 22. Certificate / privacy review
Eligibility computed server-side; issuance idempotent (unique enrolment + conflict
handling); snapshot immutable; verification exposes only approved fields; hidden
credential does not invalidate an issued certificate. No raw DB id as a public code.

## 23. Analytics / CSV review
Admin-only; filters validated (`first()` normalisation, empty→undefined); `to`
date inclusive-of-day; deterministic ordering; no submitted answers / grading /
secrets / storage paths in output; RFC-4180 quoting **plus** the new formula-
injection guard; safe filename + `text/csv` content type.

## 24. Dependency-audit result
`npm audit --omit=dev --audit-level=high` → **exit 1, 3 advisories (unchanged from
main; no dependencies were modified this phase):**
- `fast-xml-parser <5.7.0` (moderate) — advisory is in **XMLBuilder**; this app only
  uses **XMLParser** for OLX parsing → not exploitable here. Fix is a breaking major.
- `sharp <0.35.0` (high) + `next` (high, via sharp) — libvips CVEs in Next's image
  optimizer. Our banner path does its own structural validation; images optimised
  are controlled brand/banner assets. Fix requires a Next upgrade/downgrade.

All fixes are **breaking dependency changes explicitly out of scope** for this
phase (no `audit fix --force`, no major framework upgrade). Deferred to a
dependency-upgrade pass.

## 25. Performance fixes
None required; no clear N+1 or unbounded-growth defect was found in the changed
surfaces. (Admin analytics/catalogue lists are bounded by seeded scale; pagination
for large admin lists is noted as a future item, not a defect.)

## 26. Accessibility fixes
No accessibility regression introduced or found in the changed surfaces. The
security-header change is transparent to the UI (verified: auth-agnostic e2e 17/17,
including sign-in render, footer/policy aliases, mobile menu).

## 27. Deferred findings (P2/P3)
- **P3** `lib/content/sanitize.ts` uses literal control characters in a URL-scrubbing
  regex, so git treats the file as binary in diffs. Rewriting with `\xNN` escapes is
  cosmetic and risks changing the strip range; deferred (works, fully tested).
- **P3** `SELECT *` in `createDraftFromPublished` — intentional full-row copy; could be
  made explicit-column but that is more fragile across schema changes. Deferred.
- **Follow-up** Strict `Content-Security-Policy` needs the deployed Clerk domains;
  add a tested CSP at UAT (documented, not marked complete).
- **Follow-up** Production `sharp`/`next` and `fast-xml-parser` advisories — resolve in a
  dependency-upgrade pass (breaking changes).
- **Known debt** `test:e2e:auth` selectors reference pre-overhaul UI (AdminBar brand,
  inline-project organisation field, dashboard/player/enrol markup); a dedicated
  rewrite is required. The same behaviours are covered by the 192 vitest tests.

## 28–37. Gate evidence (this branch)

| Gate | Result |
|---|---|
| `format:check` | exit 0 |
| `lint` | exit 0 (no warnings/errors) |
| `typecheck` | exit 0 |
| `vitest --no-file-parallelism` | **29 files / 192 tests passed**, exit 0 (was 189; +3 regression tests) |
| `test:e2e` (auth-agnostic + parity) | **17 passed**, exit 0 |
| `test:e2e:auth` | 5 passed / 2 failed / 17 not-run (pre-existing UI-selector debt; unchanged) |
| `build` | exit 0 |
| security headers | present on `/` and `/courses` (verified via `next start` + `curl -D-`) |
| `security:audit` / `npm audit --omit=dev --audit-level=high` | exit 1 — 3 pre-existing transitive advisories (see §24) |
| `db:backup` | exit 0 |
| `db:restore:verify` (fresh dump) | OK — 13 tables, migrations=5, row counts match, exit 0 |
| seed idempotence | counts identical across 2 runs (`projects 5, credentials 15, versions 15, programmes 7, memberships 13, published 11`) |
| tracked/staged secret scan | clean |
| DB table count | 12 application tables (11 core + `account_deletion_requests`) |
| migrations 001/002/003 | unchanged |
| `maintenance_mode` | false |

## 38. Acceptance-matrix corrections
None made in this phase (no code behaviour changed that alters an acceptance
outcome). The acceptance matrix remains as delivered on main.

## 39. Remaining external blockers
Historical learner migration (B-MIGRATE), real deployed Clerk webhook, Backblaze
B2 (B-B2), RDS/RDS Proxy, Amplify UAT deploy (B-DEPLOY), Production email,
UAT→Prod OLX promotion, unsupported Open edX XBlock breadth — all remain
BLOCKED/PARTIAL and are not claimed complete.

## 40. Recommended questions for the Codex review
1. Is the allowlist `sanitizeHtml` sufficient, or should DOMPurify (server) be
   adopted now behind the same interface?
2. Is `X-Frame-Options: SAMEORIGIN` + no CSP acceptable for UAT, or should a
   Clerk-compatible CSP be authored before UAT?
3. Should the CSV formula-injection strategy prefix `'` (current) or use a
   tab/space, given the client's spreadsheet tooling?
4. Should admin analytics/catalogue lists gain deterministic pagination before a
   larger data volume?
5. Confirm the `fast-xml-parser`/`sharp`/`next` advisories are acceptable to defer to
   a dependency-upgrade pass given the non-exploitability analysis in §24.

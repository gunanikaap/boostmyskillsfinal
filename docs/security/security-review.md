# Security Review (self-conducted; no independent CLI reviewer available)

Codex CLI was not installed/authenticated in this environment, so this structured
review was performed manually per the brief (§16). Findings are recorded here and
fixes applied in the same build.

## Threat-model coverage

- **Authorization**: single server-side boundary (`requireAdmin` + access
  functions), enforced on the admin layout AND independently in every admin
  action/route/export. Browser-supplied role/ids/scores never trusted. Tests:
  `tests/db/access.test.ts`.
- **Grading secrecy**: correct answers exist only in `grading_document`; the
  content schema structurally forbids answer fields; `assertNoGradingLeak`;
  learner content/player never receive grading. Tests: `content.test.ts`,
  `assessment.test.ts`.
- **One-attempt integrity**: enforced transactionally with `FOR UPDATE` +
  unique(enrollment,unit,attempt_number); concurrent double-submit is idempotent
  (no duplicate). Test: `assessment.test.ts`.
- **Idempotent issuance/enrolment**: unique constraints + ON CONFLICT / 23505
  handling. Tests: `certificates.test.ts`, `publication.test.ts`.
- **Hidden-content enforcement**: blocks content/progress/assessment writes while
  preserving history. Test: `hidden-state.test.ts` (20 steps).
- **HTML injection**: server-side allowlist sanitiser for reading/about content
  (scripts, event handlers, javascript:/data: URLs stripped). Test: `content.test.ts`.
  NOTE: this is a UAT-grade sanitiser; for Production consider DOMPurify behind the
  same `sanitizeHtml` interface.
- **Archive safety (OLX)**: `lib/olx/archiveSafety.ts` rejects traversal, absolute
  & Windows-drive paths, symlinks, hardlinks, device/special files, compressed &
  expanded size bombs, per-file size, duplicate paths, truncation, base-256 fields;
  GNU/PAX long-name overrides are not honoured. Bounded gunzip. Tests:
  `olx-archive.test.ts` (14).
- **Open redirects**: `safeReturnPath` rejects external/protocol-relative/scheme/
  backslash/encoded-traversal return URLs. Test: `redirects.test.ts`.
- **Test-auth adapter**: double-gated on `APP_ENV==='test'`; cannot activate in a
  prod build via request/cookie.
- **Secrets**: none committed; `.env*` gitignored; `.env.example` names only;
  B2/Clerk/DB creds are env-only; verification codes carry no PII.
- **Public certificate verification**: exposes only approved fields (no email,
  Clerk id, storage paths, answers, grading). Test: `certificates.test.ts`.
- **SQL injection**: all queries parameterised (`pg` `$1..$n`); no string
  interpolation of user input into SQL.
- **SSRF/XXE**: OLX XML is parsed with `processEntities:false`, and every parse
  site routes through `parseXml()`, which rejects any `<!DOCTYPE`/`<!ENTITY`
  declaration BEFORE parsing (billion-laughs / external-entity vectors). OLX video
  embeds restricted to YouTube id encoding. Tests: `olx.test.ts` (entity hardening).

## Residual risks / follow-ups (non-blocking for UAT candidate)

1. Sanitiser is regex-allowlist based — adequate for trusted-admin authoring +
   defence-in-depth, but Production should adopt a DOM-based sanitiser.
2. Real Clerk/B2/RDS integration unverified (blocked) — see known-blockers.
3. Rate limiting / WAF is an infrastructure concern (Amplify/ALB) — not in-app.
4. CSP headers should be added at the hosting/Amplify layer for defence-in-depth.

## Verdict

No independent CLI review was available. Manual review found no unmitigated
critical/high issue in the implemented surface. External integrations remain
blocked and are not claimed as secure-in-production.

---

## Framework dependency security patch (React Server Components advisories)

**Finding (deployment-blocking).** The build was on `next@15.2.3` with
`react`/`react-dom` declared `^19.0.0`. `next@15.2.3` is affected by multiple
React Server Components / App Router advisories, including a **critical** and
several **high** issues (DoS with Server Components, SSRF via WebSocket upgrades,
and — most relevant here — a **Middleware/Proxy bypass via segment-prefetch
routes**, which directly threatens the Clerk middleware that guards `/admin`).

**Investigation (npm advisory DB, this environment).**
- `react`/`react-dom` had already *resolved* to `19.2.7` (≥ 19.0.4) via the
  caret — already patched; the declared `^19.0.0` floor was only a range floor.
- `next@15.2.9` (the latest 15.2.x patch) does **NOT** clear the HIGH advisories
  — they are fixed only in the **15.5.x** line (e.g. segment-prefetch
  middleware-bypass fixed `< 15.5.18`; several DoS/SSRF fixed `< 15.5.16`).
  Verified with `npm audit --omit=dev --json` after trialling 15.2.9.

**Resolution (minimal, non-major).** Pinned exact versions:
- `next` **15.5.20** (latest 15.5.x — a **minor** upgrade within Next 15;
  `isSemVerMajor:false`; NOT Next 16), and `eslint-config-next` **15.5.20**;
- `react` / `react-dom` **19.2.7** (exact — caret removed as required);
- `overrides.postcss` **">=8.5.10"** to clear the transitive PostCSS XSS
  advisory (a patch within 8.5.x; resolved to 8.5.20).

`npm audit fix --force` was **not** used (it wanted `next@15.5` via a breaking
path / earlier a major jump). No Next 16 upgrade.

**Production audit before → after (`npm audit --omit=dev`):**
- before (15.2.3): 3 vulns — **1 critical, 2 moderate** (the `next` package
  aggregated 1 critical + numerous high advisories).
- 15.2.9 trial: still **1 high** package (`next`, aggregating 7+ high advisories).
- after (15.5.20 + postcss override): **0 critical, 0 high, 1 moderate**.

**Remaining moderate — risk-accepted, documented.** `fast-xml-parser < 5.7.0`
(XMLBuilder CDATA/comment injection). This project uses only `XMLParser`
(`lib/olx/importer.ts`) and hand-writes export XML — **`XMLBuilder` is never
used**, so the advisory is not reachable. The only fix is a semver-**major**
bump to 5.x, deferred to avoid OLX-parser behavioural risk during an urgent
patch. Release gate `npm run security:audit` (`--audit-level=high`) exits 0.

**Regression after upgrade:** `npm run verify` PASS (format · lint · typecheck ·
**124** Vitest · production build); Playwright **7/7**; backup/restore executed
(12 tables, migrations=3, row counts match). No test was weakened or removed.

**No public deployment occurred while vulnerable** — the app has only ever run on
the local dev server (never deployed to UAT/Production; B-DEPLOY still blocked).
The dev server + webhook relay were stopped before the dependency change.

**Status: RESOLVED** for critical/high (0 in the production tree); one documented
non-exploitable moderate remains.

---

## Codex mandatory remediation (2026-07-22)

An independent Codex review of `cleanup/code-quality-pass` returned "GO WITH
MANDATORY FIXES". All accepted items were implemented on
`fix/codex-mandatory-remediation` with dedicated tests. Full detail:
[docs/reviews/codex-mandatory-remediation-report.md](../reviews/codex-mandatory-remediation-report.md).

- **AUTH-P1-001 — deactivated-account boundary.** A deletion-approved account
  (`deactivated_at` set) is now denied every learner/admin surface:
  `requireAuthenticatedUser` throws, `getActiveAppUser()` returns null, the
  maintenance-bypass and admin guards require `!deactivated`, and dashboard /
  learn / certificates pages redirect a deactivated session to `/account`.
  Tests: `deactivation.test.ts`.
- **Account-deletion policy.** `requestAccountDeletion` only targets active
  learners; `approveDeletionRequest` locks the row and re-verifies (no
  self-approve, learner-only target, active-admin resolver) with a guarded
  `WHERE … AND deactivated_at IS NULL AND role='learner'`. Tests:
  `account-deletion.test.ts`.
- **CSV-P2-001 — central injection-safe CSV.** `lib/export/csv.ts` neutralises
  formula/DDE payloads (`= + - @`, incl. after skippable control/format runs) and
  RFC-4180 quotes; analytics export uses it. Tests: `csv.test.ts`.
- **ASSET-P2-002 — revision-bound content-asset authz.** `/content-asset/[...key]`
  requires an active session, validates the credential/revision UUIDs, requires
  the key to be referenced by that exact revision, and (for learners) an
  enrolment on that revision; `private, no-store`. Tests: `content-asset.test.ts`.
- **OLX-P2-003 — storage compensation.** A failed OLX import deletes only the
  objects it wrote (never caller-owned keys), best-effort, logging an op-id +
  counts. Tests: `olx-compensation.test.ts`.
- **OPS-P2-004 — backup selection.** `db:restore:verify` selects the newest dump
  by mtime (or a `.last-backup` handoff / explicit path), not lexical order.
  Tests: `select-backup.test.ts`.
- **P3 — private caching.** `private, no-store` on the certificate PDF, OLX export
  (grading), and analytics CSV (PII). Tests: `private-download-headers.test.ts`.
- **P3 — sanitiser reviewability.** URL control-char stripping rewritten from a
  literal-control-byte regex to an explicit code-point filter. Tests:
  `sanitize.test.ts`.
- **Dependencies.** fast-xml-parser hardened (above). The newly disclosed
  `sharp < 0.35` libvips advisory (GHSA-f88m-g3jw-g9cj, HIGH) is pulled in
  transitively by `next@15.5.20`; npm's only offered fix is a **downgrade** to
  `next@14.2.35`. It is risk-accepted via a machine-readable, EXPIRING exception
  (`security/audit-exceptions.json`, expires 2026-08-21 / first cloud UAT). The
  release gate `npm run security:audit` is now exception-aware (fails on any
  unexpected OR expired high/critical); `npm run security:audit:raw` shows the
  unfiltered report. See [known-blockers.md](../uat/known-blockers.md).

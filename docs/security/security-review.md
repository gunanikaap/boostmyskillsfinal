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
- **SSRF/XXE**: XML parsing via fast-xml-parser with no DTD processing; OLX video
  embeds restricted to YouTube id encoding.

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

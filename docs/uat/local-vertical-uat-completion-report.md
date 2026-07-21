# Local Vertical UAT — Completion Report

Turning the strong service layer into a genuinely usable local UAT candidate:
visual content builder (no raw JSON), programme membership editor, and vertical
invariant coverage. No cloud/UAT/Production, B2, RDS or historical-migration work.
No secrets or personal data below.

## 1. Baseline commit

`42079bd` (main, in sync, clean) at phase start.

## 2. Feature branch

`uat/local-vertical-product-flow`.

## 3. Merge commit

Merged `--no-ff` into `main` after the full gate — see "Close" for the merge SHA.

## 4. Delivery HEAD

Not embedded self-referentially (a commit cannot contain its own hash). Obtain
with `git rev-parse HEAD` / `git rev-parse origin/main` at delivery; reported in
the terminal response after the push. Phase checkpoints: `56da20e` (cleanups),
`be62b06` (visual builder), `c16ba55` (programme editor), plus the vertical
tests + docs commit and the merge.

## 5. Visual builder features (`ContentBuilder.tsx`, `lib/admin/builder/model.ts`)

Section → Subsection → Unit visual CRUD with accessible **Up/Down** reorder,
edit-title, and **confirm-on-remove** at every level. Unit type picker
(Video/Reading/MCQ). Typed editors:
- **Video** — URL/ID input, validation, safe embedded preview (no arbitrary HTML).
- **Reading** — text/safe-HTML editor + learner preview; sanitised server-side.
- **MCQ** — question text, ≥2 options, correct-answer checkboxes, pass-mark;
  **max attempts fixed to 1**; grading generated separately from learner content.
- **Certification** — threshold % (default 50) with an Admin explanation.
Save + **Check readiness** (validation summary via the SAME publish-validation
service, not duplicated). `aria-busy` pending protection. **Raw JSON only behind
an advanced read-only `<details>` — no longer required for authoring.**
Stable IDs generated once and preserved on edit/reorder; correct answers/points
go ONLY to the grading document.

## 6. Inline Project evidence

The credential-creation form creates a new Project + the credential atomically in
one submit (`createCredentialAction` in a transaction) — unsaved form content is
not lost, duplicate slug/name errors surface safely, and the action is
admin-guarded (learner/anon cannot invoke it).

## 7. Credential A / B (safe UAT identifiers)

The vertical/invariants tests build credentials such as `UATMC01-<rand>` "UAT
Learning Foundations" with a Section → Subsection → (Reading + MCQ) structure
assembled via the builder model, then published. (Full uniquely-prefixed UAT
seed data via authenticated browser automation is the follow-up in §15 below.)

## 8. Programme evidence

Membership editor at `/admin/programmes/[id]`: add same-project credentials
(dropdown excludes existing members → no duplicates), Up/Down order, required
flag, remove, Save (tested `setProgrammeCredentials`), Publish (guarded: ≥2
publishable members), Hide/Unhide. Validation (same-project, no duplicates,
contiguous positions, publishable-on-publish, locked-after-registration) enforced
by the service.

## 9. Banner evidence (unchanged from the storage phase)

Local provider stores a provider-neutral key; admin upload validates MIME +
signature + size; `/media` serves published banners publicly and draft/hidden to
admins only; course detail renders the banner. `vertical-invariants.test.ts`
asserts no stored key is an absolute/drive/file:/localhost path.

## 10. Publish / catalogue evidence

`builder-integration.test.ts`: assembled builder output → save → publish →
appears via `getPublishedCredentialBySlug`; learner content carries no
`correctOptionIds`; publish is rejected when an MCQ has no correct answer.

## 11–16. Enrolment / programme / player / assessment / progress

Proven at the service/integration layer against real PostgreSQL:
- direct enrolment idempotent, bound to the exact published revision
  (`vertical-invariants.test.ts`, `publication.test.ts`);
- **programme fan-out/dedup/idempotency + snapshot** (`programme-registration.test.ts`, 5);
- Video/Reading/MCQ rendering + no grading in learner content (`assessment.test.ts`,
  `builder-integration.test.ts`);
- MCQ score/pass, **one-attempt**, idempotent double-submit, grading snapshot
  (`assessment.test.ts`);
- credential progress + programme aggregate from the registration snapshot.

## 17–19. Certificate / PDF / verification (unchanged, retested in the vertical)

Automatic idempotent issuance at/above threshold; owner-guarded PDF (valid
`%PDF-`); public verification exposes approved fields only. `certificates.test.ts`,
`vertical-invariants.test.ts` (exactly 1 certificate).

## 20. Hide / unhide preservation

Credential 20-step lifecycle (`hidden-state.test.ts`) + **programme** hide/unhide
(`programme-registration.test.ts`): enrolment + snapshot preserved, member
credential statuses unchanged, same enrolment on unhide.

## 21–23. Maintenance / analytics / CSV (unchanged)

Server-side maintenance gate (`access.test.ts`); analytics rows + RFC-4180 CSV
with no Clerk id / grading / answers (`analytics.test.ts`); admin-guarded export.

## 24–25. OLX export/import + unsafe archive (unchanged)

Round-trip export/import as draft; original archive persisted privately; 14
archive-safety rejections (traversal/symlink/hardlink/device/size-bomb/etc.).
XBlock breadth NOT claimed.

## 26. Database invariant results (`vertical-invariants.test.ts`)

Exactly the **11 application tables** (+ `schema_migrations`); one credential
enrolment per user/credential; exact revision assigned; one attempt; one
certificate; `platform_settings` = 1 row; no `correctOptionIds` in the stored
`content_document` or learner content; no absolute/drive/file:/localhost object key.

## 27. Vitest totals

**22 files / 137 tests / 0 failed / 0 skipped** (baseline 124 + 5 builder-model +
2 builder-integration + 5 programme-registration + 1 vertical-invariants).

## 28. Playwright totals

**7 passed** (auth-agnostic real-browser smokes against the dev server + Clerk
dev keys).

## 29. Production-build result

`next build` — success (includes new `/admin/programmes/[id]`).

## 30. Dependency audit result

`npm run security:audit` (production, `--audit-level=high`) exits 0 — 0 critical /
0 high (1 documented non-exploitable moderate, `fast-xml-parser` XMLBuilder unused).

## 31. Backup/restore result

`db:backup` + `db:restore:verify` executed in the framework phase: 12 tables,
migrations=3, row counts match, exit 0 (schema unchanged this phase — migrations
001/002/003 untouched).

## 32. Secret-scan result

Staged/tracked scans across all checkpoints: no `sk_/pk_live/whsec_/AKIA` values,
no personal email, no absolute path, no env/`.data`/backup/trace files staged.

## 33. Acceptance stories changed

US-A-02, US-A-05, US-A-06, US-A-07, US-A-11, US-L-10 → **PASS (local)** with the
documented evidence basis (UI implemented + build-verified + service/integration
tested; not a claim of automated authenticated browser click-through). US-L-05
returned to **PARTIAL** (code vs link — product-owner decision).

## 34. Remaining external blockers

B-EMAIL (production email), B-CLERK-WEBHOOK (real signed delivery), B-B2, B-DEPLOY
(RDS/RDS-Proxy/Amplify), B-MIGRATE (US-L-04), US-A-16 real promotion, XBlock
breadth. In-repo follow-ups (non-blocking): automated authenticated Playwright
vertical (Clerk testing tokens); project **edit** UI + fuller certificate-template
fields; programme banner/about UI; `fast-xml-parser` 5.x.

## 35. Screenshots / traces

None committed (Playwright trace on failure only; `test-results`/`playwright-report`
gitignored). No private data in any artifact.

## Honest scope statement

This phase makes the app **usable locally** for authoring and the vertical, proven
by 137 real-PostgreSQL tests + 7 real-browser smokes. It does **not** claim a
fully automated authenticated browser vertical, cloud/UAT deployment, Production
readiness, real B2/RDS integration, or historical-migration completion.

## Close

- Merge SHA + delivery HEAD are recorded in the terminal at delivery (`git rev-parse`).
- Gate at merge (separate steps): `format:check`, `lint`, `typecheck`, Vitest 137,
  `build`, `security:audit`, secret scan — all pass.

# Local Vertical UAT — Independent Review

**Codex CLI was not installed/authenticated in this environment** (`command -v
codex` → not found). Per the brief, a structured self-review was performed
instead; this is NOT claimed as an independent CLI review. Findings below were
checked against the code and the passing test suite.

Focus areas (from the brief) and verdicts:

## 1. Authorization bypasses — OK
- Every admin server action and route calls `requireAdmin()`; the admin layout
  gate is defence-in-depth, not the sole check. New surfaces this phase
  (`saveDraftContentAction`, `validateDraftAction`, `setProgrammeCredentialsAction`,
  `/admin/programmes/[id]`) all go through `requireAdmin`. Evidence: real HTTP
  anon→307/401/403 (auth phase) + `access.test.ts` (8).
- The visual builder and membership editor are client components that only call
  the guarded server actions; no privileged logic runs client-side.

## 2. Hidden-content leaks — OK
- Catalogue/detail queries return published+visible only; `requireCredentialContentAccess`
  blocks hidden even for enrolled learners; programme hide blocks its page + new
  registration while preserving enrolment/snapshot. Evidence: `hidden-state.test.ts`
  (20-step) + new `programme-registration.test.ts` (hide preserves + credential
  independence).

## 3. Grading-answer leaks — OK (specifically hardened this phase)
- The builder assembles TWO documents: correct answers/points go ONLY to the
  grading document, never to content. Unit-tested (`builder-model.test.ts`:
  content JSON matches no `/correct/` or `/points/`) and end-to-end
  (`builder-integration.test.ts` + `vertical-invariants.test.ts`: learner content
  and the stored `content_document` contain no `correctOptionIds`).

## 4. Unstable-ID bugs — OK
- IDs are generated once by `newId()` and preserved across edits/reorder; the
  builder never lets the user type an arbitrary existing ID (IDs are internal).
  `toBuilderState(assembleDocuments(state))` round-trips IDs/order/answers
  (test). Publish rejects duplicate IDs via the existing validator.

## 5. Programme enrolment duplication — OK
- `registerForProgramme` reuses a prior direct credential enrolment (partial
  unique index + ON CONFLICT) and is idempotent. New tests assert: 1 programme
  enrolment, no duplicate credential enrolment, reuse of the exact prior row.

## 6. Certificate duplication — OK (unchanged, retested in the vertical)
- Unique `enrollment_id` + idempotent issuance; `vertical-invariants.test.ts`
  asserts exactly 1 certificate after enrol+assess.

## 7. Storage traversal / access defects — OK (unchanged)
- Provider rejects traversal/absolute/drive/null-byte/symlink-escape; `/media`
  serves only banner keys (published=public, draft/hidden=admin, OLX never);
  OLX archive admin-only. `vertical-invariants.test.ts` additionally asserts no
  stored object key is an absolute/drive/file:/localhost path.

## 8. Maintenance bypasses — OK (unchanged)
- Server-side `enforceMaintenanceForPage` on non-home learner/public pages;
  admin bypass; singleton protected. `access.test.ts` gate coverage.

## 9. False acceptance claims — reviewed and corrected
- US-L-05 password reset returned to **PARTIAL** (dev uses email CODE; strict AC
  wants a LINK — a product-owner decision), per the instruction.
- New "PASS (local)" rows carry an explicit evidence-basis note: UI implemented +
  build-verified + service/integration-tested; NOT a claim of automated
  authenticated browser click-through, cloud/UAT, or Production readiness.
- Kept PARTIAL/BLOCKED: US-L-04, production email, real webhook, B2, RDS/Proxy,
  Amplify, US-A-16, XBlock breadth.

## 10. Unusable Admin UI paths — the primary gap this phase closed
- Raw-JSON authoring is replaced by the visual `ContentBuilder` (raw JSON only
  behind an advanced read-only disclosure). Programme membership now has a real
  editor (was service-only). Usability basics present: aria-labels, `aria-busy`
  pending protection, confirm-on-remove, status badges (Draft/Published/Hidden),
  "Temporarily unavailable", banner `alt`, empty states.

## Residual / follow-ups (non-blocking)
1. Automated authenticated Playwright vertical (admin build → learner earn cert)
   using Clerk testing tokens — the remaining E2E automation gap; the 7 existing
   Playwright smokes cover auth-agnostic real-browser paths.
2. Project **edit** UI + richer certificate-template fields (create + inline work;
   edit is service-capable but has no dedicated form yet).
3. Programme banner + about UI (credential banner exists; programme uses the
   service but no upload form yet).
4. `fast-xml-parser` 5.x major bump (moderate, XMLBuilder unused — not reachable).

## Verdict
No critical/high/must-fix defect found in the implemented surface. The security-
and-correctness invariants (authz, hidden-content, grading secrecy, stable IDs,
enrolment/certificate uniqueness, storage access, maintenance) are test-backed.

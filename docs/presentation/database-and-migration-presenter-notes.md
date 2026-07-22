# BoostMySkills — Database & Migration: Presenter Notes

Companion to `database-and-migration-executive-summary.md`, `current-database-uml.svg`, and
`current-database-core-overview.svg`. Commit `8e36e6d` · PostgreSQL 16.14.

---

## 5-minute talk track

1. **Frame it (30s).** "BoostMySkills is a micro-credential platform. The database is deliberately
   small — thirteen tables — because we keep relationships relational and the course content in JSON."
2. **The overview diagram (60s).** Walk the five colour groups on `current-database-core-overview`:
   Identity & Users, Catalogue & Content, Learning & Activity, Certification, Supporting/Operational.
   Note that `schema_migrations` (dashed) is bookkeeping, not business data.
3. **The clever bit — JSON content (60s).** `credential_versions` holds the whole
   Section→Subsection→Unit tree in `content_document`, and the answer key in a **separate**
   `grading_document` that never reaches learners.
4. **Revisions (45s).** Immutable revisions: one draft, one published; learners stay on the revision
   they enrolled on. Updating a course never rewrites history.
5. **Migration in one breath (75s).** The live site is the source. Content comes via OLX; users and
   history need database exports too. Source ids map to `external_ref`; Clerk identities are created
   in the target environment; passwords follow an approved path. **Nothing has been migrated yet** —
   this is the plan and the tooling scaffold.
6. **Close (30s).** "Ready: schema, OLX import/export, backups. Needed: live exports, the Clerk
   password decision, and a few business policies."

## 10-minute talk track

Everything above, plus:

- **Integrity in the database (90s).** Show the full UML notes: `chk_enrolment_kind` (an enrolment is
  either a programme row or a credential row, never both), single-draft/single-published partial
  indexes, one-certificate-per-enrolment (UNIQUE `enrollment_id`), one-attempt uniqueness. "These are
  guarantees the database makes, not hopes the code has."
- **Storage model (60s).** No file bytes in PostgreSQL — only logical object keys like
  `content/<credentialId>/<revisionId>/<uuid>.pdf`. Local today, Backblaze B2 later, no schema change,
  no `assets` table, no absolute paths.
- **Three migration flows (2 min).** A) live content via OLX; B) learners/history via DB exports; C)
  ongoing UAT→Production promotion. Stress that these are different and must not be conflated.
- **Zero-data-loss (90s).** It is *not* "row counts match". It is reconciliation across identity,
  content, programmes, enrolments, progress, grades and certificates, with hard thresholds — zero
  missing issued certificates, zero migration-caused duplicates, every unresolved record reported and
  owner-approved.
- **Risks & decisions (90s).** Password-hash feasibility, duplicate policy, verification-code
  conflicts, unsupported XBlocks. Point at the open-decisions table in the migration plan.

## Likely stakeholder questions & concise answers

- **Why JSON instead of more tables?** A course is a nested tree that changes shape often; JSON absorbs
  that without a migration, while a strict contract validates every write and keeps answers separate
  from learner content. Relationships that need joins/counts stay relational.
- **Why keep credential revisions?** So published content is immutable and a learner is never silently
  moved to different content — and so certificates reference exactly what was studied.
- **Why no assets table?** Files live in object storage; the database stores provider-neutral logical
  keys. This keeps the schema small and lets us switch local→B2 with no change.
- **Can hidden learners resume later?** Yes. Hiding preserves all enrolment/progress/attempt/certificate
  rows; unhiding restores access and learners resume on their assigned revision.
- **How are passwords migrated?** Not promised until the Open edX hash and Clerk import support are
  confirmed. Fallback is an approved reset/invitation or first-login claim. Passwords are never
  exported or stored in plaintext.
- **How are old certificates preserved?** They map into `certificates` with an immutable snapshot and a
  verification code; revocation is retained. "Zero missing issued certificates" is a hard acceptance
  threshold.
- **How do we prove zero data loss?** Reconciliation across every entity with sample learner
  comparisons and explicit owner sign-off on every unresolved record — not just matching totals.
- **Can UAT data be copied directly to Production?** No. Only the OLX **content** is promoted (as a
  draft, then reviewed and published). UAT learners, enrolments, progress, attempts, certificates,
  Clerk ids and settings are never copied.
- **What information is still needed from the live platform?** Live Open edX database/API exports and
  version, OLX per course, the certificate/verification records, and the business mapping (projects,
  programmes, dummy-course decisions).
- **How does this scale?** UUID keys, indexed hot paths, provider-neutral storage, a JSON content model
  that grows without migrations, and a forward-only idempotent migration runner.

## Do-not-say list (accuracy guardrails)

- Do **not** say the migration is done, tested end-to-end, or zero-downtime — it is a plan.
- Do **not** claim Clerk password-hash import will work — it is unconfirmed.
- Do **not** claim any UAT/Production/RDS/B2 execution — those are externally blocked.

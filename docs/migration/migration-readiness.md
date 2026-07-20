# Migration Readiness

> Historical learner migration is EXTERNALLY BLOCKED (B-MIGRATE, B-CLERK). No
> migrated data is invented. A dry-run mechanism is NOT a completed migration.

## What is ready

- `external_ref` columns on app_users, micro_credentials, credential_versions,
  micro_programmes, enrollments and certificates — preserve legacy identifiers.
- `sourceKey` on every imported content node (sections/subsections/units).
- Idempotent upsert service `lib/migration/service.ts` with dry-run,
  reconciliation counts (total/inserted/updated/skipped) and unresolved tracking.
  It never overwrites newer application data silently (COALESCE updates) and never
  fabricates users (no Clerk mapping means the record is recorded unresolved).
- Dry-run CLI: `node --experimental-strip-types scripts/migration/dry-run.mts`
  (`--apply` to write). Reports UNAVAILABLE when no source export is present.
- Certificate verification identifiers preserved via `external_ref` plus
  `data/redirects.json` for legacy verification URLs.

## What is needed to run a real migration

1. A real Open edX relational export (users, enrolments, progress, grades,
   certificates) — currently absent.
2. A confirmed Clerk user-mapping strategy: how legacy learners obtain Clerk
   identities (invite / import / just-in-time). Until then, users without a
   `clerkUserId` are unresolved by design.
3. An agreed course-to-credential mapping for content and enrolment linkage.

## Planned migration order (once unblocked)

learner identity mapping, user upsert, enrolment upsert, progress upsert,
grade/result upsert, certificate upsert, course/content import, then
reconciliation totals, duplicate detection and unresolved output.

## Reconciliation

Each upsert returns counts; the dry-run report is the reconciliation artifact.
Duplicate detection is via `external_ref`/email matching. Unresolved source
references are listed explicitly, never silently dropped.

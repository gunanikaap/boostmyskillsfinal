# Data Model

SQL-first PostgreSQL. UUID primary keys (`gen_random_uuid()` via pgcrypto),
`timestamptz` in UTC, CHECK constraints preferred over enums for migration safety.
Migrations: `db/migrations/001_extensions.sql`, `002_core_tables.sql`.

## The eleven frozen tables

1. **app_users** — Clerk identity → app identity + authorization. `role` CHECK
   in (`learner`,`admin`), default `learner`. `external_ref` reserved for future
   Open edX identity mapping. Role is never set from the browser.
2. **projects** — organisation lives here (no separate organisations table).
   `certificate_template jsonb` (validated by `certificateTemplateSchema`).
3. **micro_credentials** — stable catalogue identity. `status` CHECK in
   (`draft`,`published`,`hidden`). Never hard-deleted after learner history.
4. **credential_versions** — content revisions. `status` (`draft`,`published`,
   `retired`). Partial-unique: one draft, one published per credential.
   `chk_published_at_present`. Published/retired are immutable in the service layer.
5. **micro_programmes** — programme catalogue. `status` (`draft`,`published`,`hidden`).
6. **programme_credentials** — ordered membership. PK(programme,credential),
   unique(programme,position), position ≥ 0.
7. **enrollments** — programme OR credential in one table. `chk_enrolment_kind`
   enforces exactly one kind. Partial-unique: one programme enrolment and one
   credential enrolment per user. Trigger enforces version↔credential match.
   No `parent_enrollment_id`. Programme registration snapshot in `metadata`.
8. **unit_progress** — unique(enrollment,unit_id), progress 0–100.
9. **assessment_attempts** — unique(enrollment,unit_id,attempt_number),
   score/max non-negative, `chk_score_within_max`, percentage 0–100.
   `grading_snapshot` preserves rules per attempt.
10. **certificates** — unique verification_code, unique enrollment_id (idempotent),
    `status` (`issued`,`revoked`), snapshot preserves issue-time data.
11. **platform_settings** — singleton (`id = 1` CHECK), delete-prevention trigger,
    seeded in the migration.

## Do NOT exist (this release)

organisations, assets, sections/subsections/units tables, questions/options tables,
generic content_nodes/content_links, admin_jobs, audit_events,
programme_enrollment_items, generic key/value settings rows.

See `content-contract.md` for the JSON document shapes stored in
`credential_versions.content_document` / `grading_document`.

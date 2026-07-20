# Reference Reuse / Adapt / Reject Inventory

Reference material: the local `Application/` build and the reference tag
`refs/tags/day9-export-migration-redirects` (remote `boostmyskillsmain`). This
canonical build (`boostmyskillsfinal`) is a fresh, SQL-first implementation
against the frozen 11-table architecture. The reference is an implementation aid
only; old behaviour was not preserved merely because it existed.

## Reused (conceptually / patterns)

- Green sustainability visual theme + rounded-card layout and `MCxx` code labels.
- The house data-access pattern: parameterised SQL via `pg`, an optional trailing
  `Queryable` argument, and a `withTransaction` helper.
- The idea of a local, host-port-5433 dockerised Postgres for tests.
- Numbered forward-only SQL migrations with a `schema_migrations` ledger.
- OLX archive-safety intent (traversal/link/size protections) — re-implemented
  fresh against the new tar inspector and JSON content model.
- Maintenance-mode enforcement via server-side page gates (pg is Node-only), not
  edge middleware.

## Adapted

- Content model: the reference `content_nodes`/`content_links` graph was replaced
  by explicit `credential_versions.content_document`/`grading_document` JSON with
  a strict Zod contract and stable IDs.
- Publishing/versioning: adapted to `credential_versions` with one-draft/one-
  published partial-unique invariants and an atomic publish transaction.
- OLX import: adapted to produce a DRAFT `credential_versions` row + `sourceKey`
  preservation, rather than legacy content nodes.

## Rejected (explicitly not carried over)

- `content_nodes`, `content_links`, and the legacy Task-8 multi-table schema.
- Old database migrations (not imported wholesale).
- Local authentication routes and synthetic users (Clerk is the auth provider).
- Local storage routes as the canonical store (Backblaze B2 is canonical).
- Old visibility assumptions and old environment assumptions.
- `admin_jobs`, `audit_events`, generic key/value settings rows,
  `programme_enrollment_items`, `parent_enrollment_id`.

## Not merged

The reference repository was never merged into this one; the two remain
independent Git repositories. `reference` remote push is disabled.

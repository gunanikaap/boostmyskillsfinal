# Backup & Rollback

## Database backups

- RDS automated backups plus a manual snapshot immediately before any migration
  or cutover. Retain per the client data-retention policy.
- The `platform_settings` singleton is delete-protected by a DB trigger.

## Application rollback

- Amplify keeps prior build artifacts; roll back to the previous successful build.
- The app is stateless apart from the database and object storage.

## Migration rollback philosophy

- Migrations are forward-only and idempotent (`scripts/db/migrate.mts`, tracked in
  `schema_migrations`). Prefer a new forward migration over a destructive
  down-migration.
- If a migration must be reverted, restore from the pre-migration snapshot.

## Object storage

- OLX source archives and certificate PDFs live in private B2 (per environment).
  Enable B2 versioning/lifecycle for recovery. No permanent signed URLs are stored.

## Safety invariants

- Never `git reset --hard`, `git clean -fd`, or force-push shared branches.
- Never delete the singleton settings row (trigger-protected).
- Never restore Production data into UAT.

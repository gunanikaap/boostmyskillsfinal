# Access Rules

All authorization is server-side (`lib/access/guards.ts`). Client-side hiding of
admin nav is usability only, never the boundary. The browser's user IDs, roles,
enrolment IDs, unit IDs, scores and ownership are never trusted.

## Shared guards

- `requireAuthenticatedUser()` → app user or `AccessError('unauthenticated')`.
- `requireAdmin()` → admin app user or `forbidden`. Used by the admin layout AND
  independently by every admin server action / route / export.
- `requireCredentialEnrollment(credentialId)` → enrolment or `forbidden`.
- `requirePublishedCredentialAccess(credentialId)` → draft/missing ⇒ `not_found`,
  hidden ⇒ `hidden` (404 publicly), only published passes.
- `requireCredentialContentAccess(credentialId)` → published AND enrolled (hidden
  blocks even enrolled learners).
- `requireProgrammeAccess(programmeId)`.
- `requireMaintenanceAllowed({user,isHomePath,isAdminPath})`.

## Identity & roles

Clerk authenticates; the app database authorizes. `syncAppUser` upserts on sign-in
and NEVER elevates role (new users = learner; re-sync preserves role). Admin
promotion is server-side only (`promoteToAdmin`, `scripts/admin/promote.mts`).

## Test-auth adapter

`lib/auth/identity.ts` honours an injected identity ONLY when `APP_ENV==='test'`
AND `TEST_AUTH_ENABLED==='true'` (double-gated). It cannot activate in a uat/prod
build via a request parameter or public cookie.

## Maintenance

Server-side: `enforceMaintenanceForPage()` on non-home public/learner pages
redirects non-admins to `/maintenance`; admin routes and every protected write
call `requireAdmin`. Home stays open. No redeployment required.

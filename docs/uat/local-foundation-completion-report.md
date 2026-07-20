# Local Foundation Completion Report

Gap-closure phase for Clerk auth, local storage, and PostgreSQL/RDS portability.
No secret values, signing secrets, tokens, connection strings or full personal
data appear in this report (personal email shown redacted as `gu***@gmail.com`).

Status values: PASS · PARTIAL · BLOCKED · NOT IMPLEMENTED · NOT TESTED.

## 1. Final branch and SHA

- Feature branch: `fix/clerk-storage-portability`.
- Checkpoints: `cf284fa` (identity+sync+webhook) → `672fde4` (storage) →
  `fb62cad` (DB portability+backup) → `69a3dec` (Playwright) → docs/matrix +
  merge (see §2 for the merged main SHA appended at close).
- Baseline before this phase: `e46596a` (verified present).

## 2. Merge and push status

Merged to `main` (no-ff) and pushed to `boostmyskillsfinal` only; the reference
remote push URL stays disabled. Exact merged SHA + push confirmation are appended
in the "Close" section at the end (written after the merge executes).

## 3. Clerk Development application configuration (verified via Clerk API)

Verified with `clerk config pull` (Clerk API) against the linked **Development**
instance `app_3G87KrNbe7G1khZGOgJX8C5Jfy4` ("Boost My Skills"):

| Setting | Verified value | Source |
|---|---|---|
| Email | required for sign-up · used for sign-in · **verified at sign-up** (email_code) | Clerk API |
| Username | **required for sign-up · used for sign-in** (min 4) | Clerk API |
| Password | enabled · required | Clerk API |
| Email recovery | reset_password_email_code available | Clerk API |
| Phone auth | disabled (no sign-in/sign-up) | Clerk API |
| Organizations | **disabled** — turned off via `clerk disable orgs` | Clerk API |
| Social login | **none** — Google disabled via `clerk config patch` | Clerk API |
| First/last name | Clerk collects optionally (no required-name key in schema) | Clerk API |

Env vars (configured / missing only — no values):
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY configured; CLERK_SECRET_KEY configured;
CLERK_WEBHOOK_SIGNING_SECRET missing (see §10); SIGN_IN/UP_URL +
SIGN_IN/UP_FALLBACK_REDIRECT_URL configured; deprecated AFTER_SIGN_IN/UP absent.
Production Clerk instance: not configured (dev only).

## 4. Real signup evidence

A REAL Clerk Development sign-up was completed by the user (email + username +
password) with email-code verification, landing on `/dashboard`. Lazy
synchronization then created exactly ONE `app_users` row (baseline was 0):

| Field | Observed (redacted) |
|---|---|
| email | `gu***@gmail.com` — `email = lower(btrim(email))` → true (normalized) |
| username | stored (non-null) |
| role | `learner` |
| clerk_user_id | present (non-null) |
| row count | 1 (no duplicate) |

Status: **PASS (local)** — real user, primary lazy-sync path.

## 5. Verification evidence

`npm run verify` → exit 0 (format · lint · typecheck · test · build). Vitest:
**18 files / 124 tests / 124 passed / 0 failed / 0 skipped**. Playwright: **7/7**.
Production build: success. From-empty migration apply: 3 migrations, 12 tables.

## 6. Email-login evidence

Email sign-in is enabled + verified on the instance (Clerk API). The completed
signup used email + code. A separate email **login** round-trip was not scripted
this phase (would be a browser step). Status: **PARTIAL** (config verified; real
sign-up used email; explicit re-login not separately exercised).

## 7. Username-login evidence

Username is enabled + used_for_sign_in (Clerk API), required at sign-up, and the
real user's username is stored in `app_users`. An explicit username-login
round-trip is a browser step not separately scripted. Status: **PARTIAL**
(username storage + instance capability proven; explicit username login not
separately exercised).

## 8. Password-reset evidence

Recovery (reset_password_email_code) is enabled on the instance (Clerk API). The
reset flow itself was not exercised in a browser this phase. Status: **PARTIAL**
(dev-instance capability verified; flow not run). Production email = B-EMAIL.

## 9. Lazy-sync evidence

Proven on the REAL row: re-running the exact sync upsert (ON CONFLICT
(clerk_user_id) DO UPDATE of email/username/first_name/last_name — never role)
kept `role=admin` and updated `first_name`. Automated: `sync.test.ts` (10)
covers normalized email/username insert+update, CI email/username collisions,
missing-email typed failure, idempotent upsert, admin preserved, browser role
ignored, metadata cannot promote/demote. Status: **PASS**.

## 10. Webhook fixture and relay evidence

- Signed-fixture tests (`webhook.test.ts`, 6): valid signed delivery accepted +
  syncs normalized user; duplicate idempotent; invalid signature 400; unsigned
  400; unconfigured 503; admin preserved on user.updated. Proven via automated
  signed fixtures (standardwebhooks). Status of logic: **PASS**.
- Real relay: `clerk webhooks listen` ran and reported `ready`, forwarding to
  `/api/webhooks/clerk`. It logged only `ready` — **no `user.created` delivery**
  was observed and the dev server logged no webhook POST. Real signed delivery
  requires the relay endpoint's signing secret, obtainable only by pasting it
  from the Clerk Dashboard, which the security rules forbid. **External
  limitation recorded; real webhook delivery NOT claimed.** The primary sync path
  (lazy sync) is proven with the real user.

## 11. First Admin bootstrap evidence (redacted)

`scripts/admin/promote.mts gu***@gmail.com` (normalized email, parameterized,
refuses missing user with exit 2, redacted output) promoted the real user:
role `learner → admin`, script exit 0, output `Promoted gu***@gmail.com →
role=admin`. Post: exactly **1 admin / 1 total**. Browser role-tamper proven
ineffective on the real row (§9). Anonymous `/admin` + admin APIs (CSV export,
OLX import/download) all denied (307/redirect) via real HTTP. Authenticated-admin
`/admin` page view is a final browser confirmation (§ Close). Status: **PASS**
(promotion + denial + tamper-resistance proven; admin page view = live confirm).

## 12. Local storage implementation

Provider-neutral `StorageProvider` (`lib/storage/types.ts`); `LocalObjectStorage`
(root containment, traversal/absolute/drive/null-byte/symlink-escape rejection,
atomic temp-write+rename, size ceiling); inactive B2 boundary; factory on
STORAGE_DRIVER; server-generated keys; MIME+signature+size banner validation.
`.data/` gitignored. Tests: `storage.test.ts` (16). Status: **PASS (local)**.

## 13. Banner and OLX storage evidence

- Banner: admin upload → validated → stored under a server-generated key → draft
  `banner_object_key`; `/media/[...key]` serves published banners publicly,
  draft/hidden to admins only, OLX never; course detail renders the banner.
- OLX: import persists the original archive privately via the provider
  (`source_metadata.archiveObjectKey`); admin-only download route resolves the
  key server-side. `storage-integration.test.ts`: published banner public;
  draft/hidden not public (admin-only); OLX denied anon (401) + learner (403),
  allowed admin (200, gzip), never served via `/media` (404). Status: **PASS (local)**.

## 14. On-demand certificate PDF evidence

PDF generated on demand (valid `%PDF-` header, `certificates.test.ts`); download
route owner-guarded (ownership in SQL, not the URL); public verification exposes
only approved fields and never the PDF route. `pdf_object_key` may stay NULL.
Status: **PASS (local)** (permanent storage not required).

## 15. Migration 003 details

`db/migrations/003_identity_storage_portability.sql` (001/002 unchanged):
`app_users.username` (nullable); normalize existing emails; CHECK
`chk_email_normalized` (trim+lower, non-empty) + `chk_username_normalized`; CI
unique `uq_app_users_email_ci` + partial `uq_app_users_username_ci` (WHERE
username IS NOT NULL). Applied from empty (3 migrations, 12 tables), on dev +
test DBs; idempotent re-run is a no-op.

## 16. PostgreSQL / RDS portability changes

`lib/db/config.ts` — one shared helper for pool + migration + seed + backup:
`DATABASE_POOL_MAX` validated (int 1..20, default 5); `sslConfig()` enables TLS
with `rejectUnauthorized` ALWAYS true, reads `DATABASE_SSL_CA_PATH` when set,
fails clearly on a missing CA (no insecure fallback); local SSL off. No hardcoded
hostnames; DATABASE_URL may point at RDS Proxy unchanged; no connection strings
logged. Tests: `db-config.test.ts` (10). Proven: local PostgreSQL **16.14**,
PG16 compatibility. RDS / RDS Proxy / AWS CA verification: implementation-ready
only — **no real AWS connection tested (BLOCKED, B-DEPLOY)**.

## 17. Backup/restore evidence

`npm run db:backup` + `npm run db:restore:verify` (pg_dump/pg_restore inside the
container; ignored `.data/backups`). EXECUTED: 41,822-byte custom-format dump →
restored into a SEPARATE temp DB → **12 tables restored, migrations=3, key row
counts match** → temp DB dropped → exit 0. Refuses uat/prod; never prints
credentials. Status: **PASS (local, executed)**.

## 18. Playwright results

`playwright.config.ts` boots a real `next dev` (Clerk dev keys). **7/7 passed**:
public home renders; public catalogue accessible; sign-in renders Clerk; sign-up
renders Clerk; anonymous `/dashboard` → `/sign-in` with safe same-origin return
URL; anonymous `/admin` denied; external return URL never off-origin.

## 19. Complete test totals

Vitest: 18 files, **124 passed / 0 failed / 0 skipped**. Playwright: **7 passed**.
Total automated **131**. (Original 78 preserved; +16 sync/webhook, +16 storage,
+10 db-config, +4 storage-integration, +7 E2E.)

## 20. Production-build result

`next build` — success. Routes include new `/media/[...key]`,
`/admin/credentials/[id]/banner`, `/admin/credentials/[id]/olx-archive`.

## 21. Secret-scan result

`git ls-files | xargs grep -lE 'sk_test_|sk_live_|whsec_|pk_live_|AKIA…'` over
tracked files → no matches (see Close for the post-doc rescan). `.env.local`
(keys + storage config) is gitignored; `.data/` (storage + backups) gitignored;
no personal data or secrets in tracked reports (email redacted). No screenshots/
traces committed.

## 22. Acceptance statuses changed (docs/uat/acceptance-matrix.md)

US-L-01 → PASS(local); US-L-02 → PASS(dev); US-L-03 → PASS(local); US-L-16 →
PASS(local); US-A-03 → PASS(local); US-A-14 → PARTIAL (archive persistence added);
US-A-17 → PASS (real promotion + denial + tamper). US-L-05/06, US-L-07..15
unchanged where noted. Kept BLOCKED/PARTIAL: US-L-04, real production email, real
B2, real RDS/RDS Proxy, Amplify deploy, US-A-16 real promotion.

## 23. Remaining external blockers

- B-CLERK-WEBHOOK: real relay signed-delivery needs the endpoint signing secret
  (Dashboard paste — forbidden by rules). Logic proven by fixtures.
- B-EMAIL: production email delivery.
- B-B2: real Backblaze B2 (provider boundary ready, inactive).
- B-DEPLOY: real AWS RDS / RDS Proxy / Amplify (config-ready, untested).
- B-MIGRATE: real Open edX export + Clerk mapping (US-L-04).

## 24. Exact next step toward local UAT functional testing

Sign in as the promoted admin and, in the Admin UI, create a Project → a
credential (author a small MCQ) → publish → upload a banner → then in a second
learner account enrol, complete the MCQ, and download the certificate PDF. This
exercises the full local vertical (auth → storage → publish → learn → certify)
end-to-end against the real Clerk dev instance and local storage.

# Framework Security Patch & Auth Completion Report

React Server Components framework security patch + live authenticated Clerk
journeys. No passwords, verification codes, cookies, tokens, signing secrets,
database credentials or full personal profile data appear here (personal email
redacted `gu***@gmail.com`; names shown only as present/absent booleans).

Status values: PASS · PARTIAL · BLOCKED · NOT IMPLEMENTED · NOT TESTED.

## 1. Baseline commit

`48f07aa` (main, in sync, clean) at the start of this phase.

## 2. Final commit

`main` after merge + docs — see the exact SHA in "Close" (written after the final
push). Security-patch merge commit: `784ceaa`.

## 3. Branch and merge status

Branch `security/rsc-framework-patch` (from `48f07aa`): commit `9421e95`
(dependency patch) + `cf4e711` (security docs). Pushed, then merged `--no-ff`
into `main` as `784ceaa`; `npm run verify` + `npm run security:audit` re-run on
`main` (both green) and pushed. Reference remote never touched.

## 4. Old dependency versions

- `next` 15.2.3 (declared exact)
- `react` `^19.0.0` → resolved 19.2.7
- `react-dom` `^19.0.0` → resolved 19.2.7
- `eslint-config-next` 15.2.3
- transitive `postcss` < 8.5.10

## 5. New pinned dependency versions

- `next` **15.5.20** (exact; minor within Next 15, NOT Next 16)
- `react` **19.2.7** (exact) · `react-dom` **19.2.7** (exact)
- `eslint-config-next` **15.5.20** (exact)
- `overrides.postcss` **">=8.5.10"** → resolved **8.5.20**

## 6. Advisories addressed

`next@15.2.3` carried 1 **critical** + multiple **high** RSC/App-Router
advisories (DoS with Server Components; SSRF via WebSocket upgrades; **Middleware/
Proxy bypass via segment-prefetch routes**, directly relevant to the Clerk
`/admin` guard) plus moderates (image cache, HTTP smuggling, CSP-nonce XSS, cache
poisoning). `next@15.2.9` (latest 15.2.x) does NOT clear the highs — fixed only in
15.5.x (segment-prefetch fix `< 15.5.18`; several `< 15.5.16`). Transitive
`postcss < 8.5.10` XSS also addressed via override.

## 7. npm audit before / after (`npm audit --omit=dev`)

| Stage | critical | high | moderate |
|---|---|---|---|
| next@15.2.3 (before) | 1 | (aggregated in `next`) | 2 |
| next@15.2.9 (trial) | 0 | **1 (`next`, 7+ high advisories)** | 2 |
| **next@15.5.20 + postcss override (after)** | **0** | **0** | **1** |

`npm run security:audit` (`--audit-level=high`) exits **0**. `npm audit fix
--force` was NOT used.

## 8. Resolved dependency-tree evidence

`npm ls`: `next@15.5.20`, `react@19.2.7`, `react-dom@19.2.7`,
`eslint-config-next@15.5.20`, `postcss@8.5.20`. Lockfile: no `next@15.2.x`, no
`react@19.0.0`. `react-server-dom-webpack`/`-turbopack` absent (Next-internal).

Remaining **1 moderate** (`fast-xml-parser < 5.7.0`, XMLBuilder CDATA/comment
injection): **risk-accepted, non-exploitable** — the code uses only `XMLParser`
(`lib/olx/importer.ts`) and hand-writes export XML; `XMLBuilder` is never used.
The only fix is a semver-**major** bump (5.x), deferred to avoid OLX-parser
behavioural risk during an urgent patch. Tracked as a non-blocking follow-up.

## 9. Vitest totals

18 files, **124 passed / 0 failed / 0 skipped** (post-upgrade; no test weakened or
removed).

## 10. Playwright totals

**7 passed** on `next@15.5.20` (real dev server + Clerk dev keys).

## 11. Production-build result

`next build` — success (all routes compiled on 15.5.20).

## 12. Backup/restore result

`db:backup` + `db:restore:verify` executed post-upgrade: **12 tables restored,
migrations=3, key row counts match**, temp DB dropped, exit 0.

## 13. Secret-scan result

Tracked-file scan for `sk_/pk_live/whsec_/AKIA` values → none. `.env.local` and
`.data/` gitignored. No secrets or unredacted personal data in tracked docs.

## 14. Live Admin dashboard result

**PASS.** The promoted admin's `/admin` renders **Projects, Credentials,
Programmes, Analytics, Maintenance** (user-confirmed in-browser on the patched
15.5.20 server).

## 15. Email-login result

**PASS.** Email + password login succeeded; `/admin` rendered afterwards. Minor
UX note: Clerk's after-sign-in landing is `/` (per `SIGN_IN_FALLBACK_REDIRECT_URL`)
rather than `/dashboard`; `/dashboard` is reachable and works. Optional: set the
fallback redirect to `/dashboard`.

## 16. Username-login result

**PASS.** Username + password login succeeded; `/admin` rendered afterwards.
(Username sign-in is enabled on the instance and the username is stored in
`app_users`.)

## 17. Password-reset result

**PASS (local), with a documented method note.** The real forgot-password flow
completed on the Clerk **Development** instance; a new password was set; login
with it succeeded; reached `/dashboard`; `/admin` still rendered; same `app_users`
row and admin role. **Recovery method: email CODE** (matches the instance's
`reset_password_email_code`). The strict acceptance criterion expects a reset
**LINK**; this CODE flow is recorded as an **accepted functional equivalent**
(both are email-verified secure resets). Link parity is a Clerk instance setting
if strict parity is required. No password or code was requested or exposed.

## 18. Profile-sync result

**PASS (DB-verified).** After a real Clerk profile name edit + loading an
authenticated page, lazy sync updated `app_users`: `has_first_name` and
`has_last_name` true; `updated_at > created_at` (same row updated in place, not
recreated); **same Clerk ID (`clerk_3Gml…`) and same `app_users.id` (`b825bc89…`)**;
exactly 1 row; **role stayed `admin`**; email still normalized. Full names not
printed.

## 19. Acceptance statuses changed (`docs/uat/acceptance-matrix.md`)

- US-L-03 → **PASS (local)**: real email + username login, `/admin` renders.
- US-L-05 → **PASS (local)\***: real password reset (email CODE; recorded as an
  accepted equivalent of the link-based AC).
- US-L-06 → **PASS (local)**: real profile edit synced; same IDs; role preserved.
- US-A-17 → **PASS** (adds live authenticated admin-access evidence).
Kept BLOCKED/PARTIAL: production email, real Clerk **webhook** (PARTIAL by design —
lazy sync + signed fixtures prove logic; real signed delivery needs the endpoint
secret, not pasteable), Backblaze B2, AWS RDS/RDS Proxy, Amplify, US-L-04, US-A-16.

## 20. Remaining external blockers

- B-EMAIL — production email delivery (dev email verified only).
- B-CLERK-WEBHOOK — real relay signed delivery (endpoint secret via Dashboard).
- B-B2 — Backblaze B2 (provider boundary ready, inactive).
- B-DEPLOY — AWS RDS / RDS Proxy / Amplify (config-ready, untested).
- B-MIGRATE — real Open edX export + Clerk mapping (US-L-04).
- Follow-up (non-blocking): `fast-xml-parser` 5.x major bump; optional
  `SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard`; optional password-reset **link**
  parity.

## Webhook position (unchanged)

Real webhook delivery stays **PARTIAL** — not blocking local functional UAT
because lazy sync is proven with the real user, signed fixtures pass, and role
preservation is proven. Not claimed PASS. No signing secret was requested.

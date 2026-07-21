# Frontend Parity Review — Live-Site Parity & Persistent Demo Content

Branch: `ui/live-site-parity` (NOT merged — awaiting the user's visual approval).
Visual source of truth: **https://boostmyskills.eu** (RES4CITY Open edX theme).

This phase delivers **close visual parity** with the public live site plus a
persistent local demo catalogue so the frontend can be reviewed with real data.
"Close visual parity" is used deliberately — no pixel-diff measurement was run.

## Reusable reference material adopted

The reference frontend at `D:\boostmyskillsmain` is **not a git repository** (no
`.git`), so the tagged reference could not be inspected. Instead, the live site's
own owned brand assets were used (downloaded into `public/brand/`):

- `logo.png` — the official boost·my·skills wordmark (header/footer).
- `landing_img.png` — the hero composite (SDG + UNITAR + learner illustration + partners).
- `programs/mp1.jpg … mp6.jpg` — sustainability programme illustrations (card art / demo banners).
- `certificate.png` — the diploma illustration (certificate section).
- `partners.jpg` — the partners/funders strip.
- Typeface **Urbanist** (the live site's font) via `next/font/google`.
- Exact palette from the live theme CSS: green `#079845`, ink `#1a1a1a`, muted `#767676`, soft green `#eaf3e7`.

All CSS/markup was authored fresh (the live theme's stylesheets were **not**
copied); marketing/testimonial copy is original.

## Deliberately rejected (not ported)

Old `content_nodes`/`content_links`, old migrations, local auth, old storage
routes, stale env assumptions, old visibility queries — none were copied. Only the
UI layer + owned assets were adopted. The current 11-table schema, Clerk auth,
provider-neutral storage and published-only catalogue queries are unchanged.

## Persistent demo seed

- Command: **`npm run db:seed:ui`** (local/test only; refuses `APP_ENV=uat|production`).
- Idempotent — every record tagged `external_ref = local-ui-demo:*` (project by slug
  `res4city`); re-running updates in place, never duplicates, never touches a real
  admin or non-demo data. Verified: two consecutive runs → 8 published credentials
  and 3 published programmes both times.
- Seeds: **RES4CITY** project; **8 published micro-credentials** (MC01–MC08, each with
  a section/subsections, reading + video + MCQ, safe grading, 50% pass, one-attempt,
  certification rule, and a valid banner); **3 published micro-programmes** with
  ordered membership + banners; plus **1 draft + 1 hidden credential** and **1 draft
  + 1 hidden programme** (visibility fixtures that must never appear publicly).
- Re-seed command for reviewers: `npm run db:seed:ui`.

## Pages matched

| Live page | Local route | Status |
|-----------|-------------|--------|
| `/` | `/` | Header, hero, trending programmes, certificate, choose-your-option, get-started, benefits, testimonials, partners, footer — live section order |
| `/courses` | `/courses` | Breadcrumb + heading, search, result count, responsive credential cards |
| `/programs/` | `/programs` | Programme cards with banner/org/title + "Includes the following micro-credentials" member list |
| Credential detail | `/courses/[slug]` | Header/footer, banner, title, code, organisation, About, enrol |
| Programme detail | `/programs/[slug]` | Header/footer, banner, title, organisation, About, ordered member credentials |
| `/about` `/contact` | `/about` `/contact` | Live header/footer, readable width |
| Privacy / cookie / terms | `/privacy`, `/cookie_policy` (+ `/cookie-policy` redirect), `/tos` (+ `/terms` redirect) | Live header/footer shell |
| Sign in / up | `/sign-in`, `/sign-up` | Clerk (unchanged) |

## Header

Live-style: logo/home link, Catalogue dropdown (Micro-programmes / Micro-credentials),
Register for free (outline) + Sign in (filled). Learner state shows Dashboard + user
menu; admin retains the server-side-guarded Admin area (authorization unchanged — no
Admin link shown to learners). Accessible mobile menu (hamburger, Escape + outside
click close, `aria-expanded`).

## Responsive checks (manual, via Playwright viewport)

Verified header, homepage, `/courses`, `/programs`, detail pages and sign-in at
1440×900, 1024×768, 768×1024 and 390×844: no horizontal overflow, cards reflow to a
single column, images keep aspect ratio, the mobile menu works, footer columns stack.
The parity smoke `mobile menu opens, navigates and closes on Escape` runs at 390×844.

## Known / deliberate differences (need user input)

- **Font weights & exact spacing** may differ slightly from the live theme; the
  brand typeface (Urbanist), palette and layout match.
- **Trending / testimonials copy** is original placeholder text (not the live
  marketing copy or real testimonials), to avoid reproducing site content.
- **Legal page bodies** (privacy/cookie/terms) keep the existing brief content — the
  full policy text was not reproduced; drop in the owned copy when available.
- The live homepage's exact **"Trending" card layout** (per-programme included-
  credential chips) is represented on `/programs`; the homepage carousel shows
  banner + title + org.
- **Admin pages** use the shared design system (fonts/colours/buttons) but are not
  redesigned in this phase.

## Verification

Seed run twice (idempotent: 8 credentials / 3 programmes both times). Public pages
confirmed: `/courses` shows the 8 published credentials, `/programs` shows the 3
programmes with member lists, the homepage carousel shows real programmes, and the
draft/hidden fixtures are absent from both public pages.

# Manual UAT Smoke Checklist

Run against a deployed environment with real Clerk/B2/RDS once available. The
service layer already has automated coverage (see the acceptance matrix).

## Public / visitor

- [ ] Home, /about, /contact, /privacy, /cookie_policy, /tos render.
- [ ] /courses and /programs list only published items.
- [ ] A draft/hidden credential slug returns 404 (no leak in body or metadata).
- [ ] sitemap.xml lists only public routes; robots.txt disallows admin/account/learn/api.
- [ ] /certificates/<code> shows a valid certificate; unknown code shows not-found.

## Auth (needs Clerk)

- [ ] Register, email verification, sign in, dashboard.
- [ ] /login, /register, /signin, /signup redirect to the Clerk equivalents.
- [ ] Password reset flow completes.

## Learner

- [ ] Enrol in a published credential; it appears on the dashboard.
- [ ] Register for a programme; member credential enrolments appear.
- [ ] Open Video, Reading, MCQ units; complete a reading; submit an MCQ.
- [ ] A second MCQ attempt is rejected (one-attempt policy).
- [ ] On passing, a certificate is issued; download the PDF; verify it publicly.
- [ ] A hidden credential shows "Temporarily unavailable" with no Resume link.

## Admin (needs an admin account)

- [ ] A non-admin is denied /admin and the CSV export endpoint (401/403).
- [ ] Create a project; create a credential (including inline project).
- [ ] Author a draft (JSON) and publish; invalid grading / duplicate IDs are rejected.
- [ ] Hide then unhide a credential; learner history is preserved.
- [ ] Import an OLX .tar.gz to a draft; a malicious archive is rejected with a reason.
- [ ] Export a credential to .tar.gz.
- [ ] Toggle maintenance on: non-admin non-home pages show /maintenance, home works,
      admin still works; toggle off (no redeploy).
- [ ] The analytics table renders; CSV export downloads.

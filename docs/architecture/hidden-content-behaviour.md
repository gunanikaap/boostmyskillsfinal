# Hidden-Content Behaviour

"Hidden" = no learner content access, all history preserved. Enforced by
`requirePublishedCredentialAccess` / `resolveAssigned` (player) and the catalogue
queries. Verified end-to-end by `tests/db/hidden-state.test.ts` (20 steps).

## Hidden Micro Credential

Removed from catalogue; public detail 404; new enrolment rejected
(`not_enrollable`); Sections/Subsections/Units, Video/Reading, MCQ access +
submission, progress writes and assessment writes all blocked — including
bookmarked/typed URLs. Preserved: enrolments, unit progress, video/reading state,
attempts, grades, certificate records. Admin retains review/edit. Existing
certificates remain downloadable and publicly verifiable.

Dashboard shows the item as **Temporarily unavailable** with the preserved
progress %, and **no Resume button or content links**.

## Unhide

Parent status → published; original enrolment reused; original
`credential_version_id` preserved; progress/attempts/scores preserved; learner
resumes. No re-enrol, no reset, no automatic move to the newest revision.

## Hidden Micro Programme

Absent from catalogue; detail + container blocked; new registration rejected;
programme enrolment + aggregate progress preserved. Hiding a programme does not
mutate member credentials' independent status.

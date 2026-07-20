# Content Contract

Runtime schema: `lib/content/schema.ts` (Zod, strict). Cross-validation:
`lib/content/validate.ts`. UAT defaults: `lib/content/defaults.ts`.

## content_document (learner-facing — NEVER contains answers)

`{ schemaVersion: 1, sections: [{ id, sourceKey, title, subsections: [{ id,
sourceKey, title, units: [{ id, sourceKey, type: video|reading|mcq, title,
required, data }] }] }] }`

- **video** `data`: `{ youtubeId? , mediaObjectKey?, durationSeconds? }` (one of
  youtubeId/mediaObjectKey required).
- **reading** `data`: `{ html }` — sanitised server-side (`lib/content/sanitize.ts`).
- **mcq** `data`: `{ passMark, questions: [{ id, text, options: [{ id, text }] }] }`
  — **no correctness field is permitted** (strict schema rejects it).

## grading_document (server-only — never sent to a learner)

`{ schemaVersion: 1, units: [{ unitId, passMark, maxAttempts, questions:
[{ questionId, correctOptionIds, points }] }] }`

`assertNoGradingLeak()` guards learner payloads. Correct answers exist ONLY here.

## Stable IDs

Generated once; reorder never regenerates; copy-to-draft preserves IDs; imported
OLX nodes keep their identifier in `sourceKey`; duplicates are rejected on publish.

## Publish validation (in one transaction — `validateDraftForPublish`)

Validate shapes → verify ID uniqueness → grading references existing question/option
IDs → content has no answers (structural) → certification config valid → retire
previous published → publish draft → set parent published. Atomic.

## UAT defaults (explicit, validated — not magic numbers)

- Certification threshold: **50%** (`DEFAULT_CERTIFICATION_THRESHOLD`).
- MCQ max attempts: **1** (`DEFAULT_MCQ_MAX_ATTEMPTS`).
- Banner: 16:9, 1600×900 rec., WebP/JPEG/PNG, ≤ 2 MB (`BANNER_RULES`).

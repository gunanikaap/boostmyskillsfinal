import { z } from "zod";
import { CONTENT_SCHEMA_VERSION } from "@/lib/content/defaults";

/**
 * Runtime content contract (Zod). This is the single source of truth for the
 * shape of credential_versions.content_document, grading_document,
 * certification_rule and the project certificate_template.
 *
 * CRITICAL SECURITY INVARIANT: the learner-facing content_document must NEVER
 * contain correct answers. Correct answers live ONLY in grading_document.
 * The MCQ content schema below has no field for correctness — any such field is
 * a strict-parse error.
 */

const stableId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "id must be url/path-safe");

// --- Unit payloads (learner-facing) -----------------------------------------

const videoData = z
  .object({
    // Existing YouTube behaviour, plus an optional object-storage media key.
    youtubeId: z.string().min(1).max(64).optional(),
    mediaObjectKey: z.string().min(1).max(512).optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((d) => d.youtubeId || d.mediaObjectKey, {
    message: "video unit requires youtubeId or mediaObjectKey",
  });

const readingData = z
  .object({
    // Raw HTML is sanitised server-side before persistence (see sanitize.ts).
    html: z.string().max(200_000),
  })
  .strict();

const mcqOption = z
  .object({
    id: stableId,
    text: z.string().min(1).max(2000),
  })
  .strict(); // NO correctness flag permitted here.

const mcqQuestion = z
  .object({
    id: stableId,
    text: z.string().min(1).max(4000),
    options: z.array(mcqOption).min(2).max(20),
  })
  .strict();

const mcqData = z
  .object({
    passMark: z.number().min(0).max(100),
    questions: z.array(mcqQuestion).min(1).max(200),
  })
  .strict();

const baseUnit = {
  id: stableId,
  sourceKey: z.string().max(256).nullable(),
  title: z.string().min(1).max(500),
  required: z.boolean(),
};

const unit = z.discriminatedUnion("type", [
  z.object({ ...baseUnit, type: z.literal("video"), data: videoData }).strict(),
  z.object({ ...baseUnit, type: z.literal("reading"), data: readingData }).strict(),
  z.object({ ...baseUnit, type: z.literal("mcq"), data: mcqData }).strict(),
]);

const subsection = z
  .object({
    id: stableId,
    sourceKey: z.string().max(256).nullable(),
    title: z.string().min(1).max(500),
    units: z.array(unit),
  })
  .strict();

const section = z
  .object({
    id: stableId,
    sourceKey: z.string().max(256).nullable(),
    title: z.string().min(1).max(500),
    subsections: z.array(subsection),
  })
  .strict();

export const contentDocumentSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    sections: z.array(section),
  })
  .strict();

export type ContentDocument = z.infer<typeof contentDocumentSchema>;
export type Unit = z.infer<typeof unit>;

// --- Grading document (server-only; never sent to learners) -----------------

const gradingQuestion = z
  .object({
    questionId: stableId,
    correctOptionIds: z.array(stableId).min(1),
    points: z.number().positive().default(1),
  })
  .strict();

const gradingUnit = z
  .object({
    unitId: stableId,
    passMark: z.number().min(0).max(100),
    maxAttempts: z.number().int().positive(),
    questions: z.array(gradingQuestion).min(1),
  })
  .strict();

export const gradingDocumentSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    units: z.array(gradingUnit),
  })
  .strict();

export type GradingDocument = z.infer<typeof gradingDocumentSchema>;

// --- Certification rule ------------------------------------------------------

export const certificationRuleSchema = z
  .object({
    thresholdPercent: z.number().min(0).max(100),
    // Optional list of unit ids that must be completed regardless of score.
    requiredUnitIds: z.array(stableId).default([]),
  })
  .strict();

export type CertificationRule = z.infer<typeof certificationRuleSchema>;

// --- About content (structured rich text, sanitised) ------------------------

export const aboutContentSchema = z
  .object({
    html: z.string().max(200_000),
  })
  .strict();

// --- Project certificate template -------------------------------------------

export const certificateTemplateSchema = z
  .object({
    issuerName: z.string().min(1).max(300),
    logoObjectKey: z.string().max(512).nullable().default(null),
    backgroundObjectKey: z.string().max(512).nullable().default(null),
    signatoryName: z.string().max(300).nullable().default(null),
    signatoryRole: z.string().max(300).nullable().default(null),
    presentation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;

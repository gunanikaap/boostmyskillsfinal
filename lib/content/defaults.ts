/**
 * Centralised UAT defaults. These are explicit, validated values — not magic
 * numbers scattered through the code. They are documented as UAT defaults pending
 * final stakeholder confirmation (see docs/architecture/content-contract.md).
 */

/** Current content-document schema version. */
export const CONTENT_SCHEMA_VERSION = 1;

/** Certification threshold as a percentage (0–100). UAT default: 50%. */
export const DEFAULT_CERTIFICATION_THRESHOLD = 50;

/** Maximum MCQ attempts per unit. UAT default: exactly one. */
export const DEFAULT_MCQ_MAX_ATTEMPTS = 1;

/** Provisional banner-image rules for UAT (pending stakeholder confirmation). */
export const BANNER_RULES = {
  aspectRatio: "16:9",
  recommendedWidth: 1600,
  recommendedHeight: 900,
  allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"] as const,
  maxBytes: 2 * 1024 * 1024, // 2 MB
} as const;

export type UnitType = "video" | "reading" | "mcq";
export const UNIT_TYPES: readonly UnitType[] = ["video", "reading", "mcq"];

import type { ContentDocument, GradingDocument, CertificationRule } from "@/lib/content/schema";
import { CONTENT_SCHEMA_VERSION, DEFAULT_MCQ_MAX_ATTEMPTS } from "@/lib/content/defaults";

/**
 * Visual-builder data model + pure assembly logic. This is deliberately a lib
 * module (not only React state) so the security-critical invariants are unit
 * tested:
 *  - correct answers live ONLY in the grading document, never in content;
 *  - stable IDs are generated once and preserved across edits/reorder.
 *
 * The final content/grading are still validated by the existing services on
 * save/publish (`validateDraftForPublish`) — this module does not duplicate that.
 */

export interface BuilderOption {
  id: string;
  text: string;
  correct: boolean; // builder-only; assembled into grading, never into content
}
export interface BuilderQuestion {
  id: string;
  text: string;
  points: number; // builder-only; assembled into grading
  options: BuilderOption[];
}
interface UnitBase {
  id: string;
  title: string;
  required: boolean;
  sourceKey: string | null;
}
export type BuilderUnit =
  | (UnitBase & { type: "video"; data: { youtubeId?: string; mediaObjectKey?: string } })
  | (UnitBase & { type: "reading"; data: { html: string } })
  | (UnitBase & { type: "mcq"; data: { passMark: number; questions: BuilderQuestion[] } });
export interface BuilderSubsection {
  id: string;
  title: string;
  sourceKey: string | null;
  units: BuilderUnit[];
}
export interface BuilderSection {
  id: string;
  title: string;
  sourceKey: string | null;
  subsections: BuilderSubsection[];
}
export interface BuilderState {
  sections: BuilderSection[];
  certification: { thresholdPercent: number; requiredUnitIds: string[] };
}

/** Stable, url/path-safe id generated ONCE by trusted builder code. */
export function newId(prefix: "s" | "ss" | "u" | "q" | "o"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rand}`;
}

/** Extract an 11-char YouTube id from a URL or accept a bare id. */
export function youtubeIdFromUrl(input: string): string | null {
  const s = (input ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(
    s,
  );
  return m ? m[1]! : null;
}

/**
 * Assemble the learner-facing content document + the server-only grading
 * document from builder state. Correct answers and points go ONLY to grading.
 */
export function assembleDocuments(state: BuilderState): {
  content: ContentDocument;
  grading: GradingDocument;
} {
  const content: ContentDocument = { schemaVersion: CONTENT_SCHEMA_VERSION, sections: [] };
  const grading: GradingDocument = { schemaVersion: CONTENT_SCHEMA_VERSION, units: [] };

  for (const s of state.sections) {
    content.sections.push({
      id: s.id,
      sourceKey: s.sourceKey,
      title: s.title,
      subsections: s.subsections.map((ss) => ({
        id: ss.id,
        sourceKey: ss.sourceKey,
        title: ss.title,
        units: ss.units.map((u) => {
          if (u.type === "mcq") {
            // Grading (server-only): correct option ids + points.
            grading.units.push({
              unitId: u.id,
              passMark: u.data.passMark,
              maxAttempts: DEFAULT_MCQ_MAX_ATTEMPTS,
              questions: u.data.questions.map((q) => ({
                questionId: q.id,
                correctOptionIds: q.options.filter((o) => o.correct).map((o) => o.id),
                points: q.points > 0 ? q.points : 1,
              })),
            });
            // Content (learner-facing): NO correctness, NO points.
            return {
              id: u.id,
              sourceKey: u.sourceKey,
              type: "mcq" as const,
              title: u.title,
              required: u.required,
              data: {
                passMark: u.data.passMark,
                questions: u.data.questions.map((q) => ({
                  id: q.id,
                  text: q.text,
                  options: q.options.map((o) => ({ id: o.id, text: o.text })),
                })),
              },
            };
          }
          if (u.type === "video") {
            const data: { youtubeId?: string; mediaObjectKey?: string } = {};
            if (u.data.youtubeId) data.youtubeId = u.data.youtubeId;
            if (u.data.mediaObjectKey) data.mediaObjectKey = u.data.mediaObjectKey;
            return {
              id: u.id,
              sourceKey: u.sourceKey,
              type: "video" as const,
              title: u.title,
              required: u.required,
              data,
            };
          }
          return {
            id: u.id,
            sourceKey: u.sourceKey,
            type: "reading" as const,
            title: u.title,
            required: u.required,
            data: { html: u.data.html },
          };
        }),
      })),
    });
  }
  return { content, grading };
}

export function certificationRule(state: BuilderState): CertificationRule {
  // Keep only required-unit ids that still exist in the content (a unit may have
  // been removed after being ticked), so publish validation never sees a dangle.
  const existing = new Set(
    state.sections.flatMap((s) => s.subsections.flatMap((ss) => ss.units.map((u) => u.id))),
  );
  return {
    thresholdPercent: state.certification.thresholdPercent,
    requiredUnitIds: state.certification.requiredUnitIds.filter((id) => existing.has(id)),
  };
}

/** Load builder state from an existing draft's content + grading (edit/copy). */
export function toBuilderState(
  content: ContentDocument,
  grading: GradingDocument,
  rule: CertificationRule,
): BuilderState {
  const gradingByUnit = new Map(grading.units.map((u) => [u.unitId, u]));
  return {
    certification: {
      thresholdPercent: rule?.thresholdPercent ?? 50,
      requiredUnitIds: rule?.requiredUnitIds ?? [],
    },
    sections: content.sections.map((s) => ({
      id: s.id,
      title: s.title,
      sourceKey: s.sourceKey,
      subsections: s.subsections.map((ss) => ({
        id: ss.id,
        title: ss.title,
        sourceKey: ss.sourceKey,
        units: ss.units.map((u): BuilderUnit => {
          if (u.type === "mcq") {
            const g = gradingByUnit.get(u.id);
            const correctByQ = new Map(
              (g?.questions ?? []).map((q) => [
                q.questionId,
                { correct: new Set(q.correctOptionIds), points: q.points },
              ]),
            );
            return {
              id: u.id,
              title: u.title,
              required: u.required,
              sourceKey: u.sourceKey,
              type: "mcq",
              data: {
                passMark: u.data.passMark,
                questions: u.data.questions.map((q) => ({
                  id: q.id,
                  text: q.text,
                  points: correctByQ.get(q.id)?.points ?? 1,
                  options: q.options.map((o) => ({
                    id: o.id,
                    text: o.text,
                    correct: correctByQ.get(q.id)?.correct.has(o.id) ?? false,
                  })),
                })),
              },
            };
          }
          if (u.type === "video") {
            return {
              id: u.id,
              title: u.title,
              required: u.required,
              sourceKey: u.sourceKey,
              type: "video",
              data: { ...u.data },
            };
          }
          return {
            id: u.id,
            title: u.title,
            required: u.required,
            sourceKey: u.sourceKey,
            type: "reading",
            data: { html: u.data.html },
          };
        }),
      })),
    })),
  };
}

/** Empty builder state for a fresh draft. */
export function emptyBuilderState(threshold = 50): BuilderState {
  return { sections: [], certification: { thresholdPercent: threshold, requiredUnitIds: [] } };
}

import {
  contentDocumentSchema,
  gradingDocumentSchema,
  certificationRuleSchema,
  type ContentDocument,
  type GradingDocument,
} from "@/lib/content/schema";

export class ContentValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Content validation failed: ${issues.join("; ")}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

interface ContentIndex {
  unitIds: Set<string>;
  mcqUnits: Map<
    string,
    { questionIds: Set<string>; optionIdsByQuestion: Map<string, Set<string>> }
  >;
}

/** Collect all stable IDs and assert global uniqueness across the document. */
function indexContent(doc: ContentDocument): ContentIndex {
  const seen = new Set<string>();
  const issues: string[] = [];
  const unitIds = new Set<string>();
  const mcqUnits: ContentIndex["mcqUnits"] = new Map();

  const claim = (id: string, kind: string) => {
    if (seen.has(id)) issues.push(`duplicate id "${id}" (${kind})`);
    seen.add(id);
  };

  for (const section of doc.sections) {
    claim(section.id, "section");
    for (const sub of section.subsections) {
      claim(sub.id, "subsection");
      for (const unit of sub.units) {
        claim(unit.id, "unit");
        unitIds.add(unit.id);
        if (unit.type === "mcq") {
          const questionIds = new Set<string>();
          const optionIdsByQuestion = new Map<string, Set<string>>();
          for (const q of unit.data.questions) {
            claim(q.id, "question");
            questionIds.add(q.id);
            const opts = new Set<string>();
            for (const o of q.options) {
              claim(o.id, "option");
              opts.add(o.id);
            }
            optionIdsByQuestion.set(q.id, opts);
          }
          mcqUnits.set(unit.id, { questionIds, optionIdsByQuestion });
        }
      }
    }
  }

  if (issues.length) throw new ContentValidationError(issues);
  return { unitIds, mcqUnits };
}

/**
 * Full publish-time validation of a draft.
 * Steps mirror §3.4: validate shapes, verify id uniqueness, verify grading
 * references existing question/option ids, verify content has no grading answers
 * (enforced structurally by the strict schema), verify certification config.
 */
export function validateDraftForPublish(input: {
  content: unknown;
  grading: unknown;
  certificationRule: unknown;
}): { content: ContentDocument; grading: GradingDocument } {
  const issues: string[] = [];

  const contentParsed = contentDocumentSchema.safeParse(input.content);
  if (!contentParsed.success) {
    for (const i of contentParsed.error.issues)
      issues.push(`content: ${i.path.join(".")} ${i.message}`);
    throw new ContentValidationError(issues);
  }
  const content = contentParsed.data;

  const gradingParsed = gradingDocumentSchema.safeParse(input.grading);
  if (!gradingParsed.success) {
    for (const i of gradingParsed.error.issues)
      issues.push(`grading: ${i.path.join(".")} ${i.message}`);
    throw new ContentValidationError(issues);
  }
  const grading = gradingParsed.data;

  const ruleParsed = certificationRuleSchema.safeParse(input.certificationRule);
  if (!ruleParsed.success) {
    for (const i of ruleParsed.error.issues)
      issues.push(`certificationRule: ${i.path.join(".")} ${i.message}`);
    throw new ContentValidationError(issues);
  }
  const rule = ruleParsed.data;

  const index = indexContent(content); // throws on duplicate ids

  // Every grading unit must reference an existing MCQ unit and its question/option ids.
  const gradedUnitIds = new Set<string>();
  for (const gUnit of grading.units) {
    if (gradedUnitIds.has(gUnit.unitId)) issues.push(`grading: duplicate unit "${gUnit.unitId}"`);
    gradedUnitIds.add(gUnit.unitId);
    const mcq = index.mcqUnits.get(gUnit.unitId);
    if (!mcq) {
      issues.push(`grading references unknown mcq unit "${gUnit.unitId}"`);
      continue;
    }
    for (const q of gUnit.questions) {
      if (!mcq.questionIds.has(q.questionId)) {
        issues.push(`grading unit "${gUnit.unitId}" references unknown question "${q.questionId}"`);
        continue;
      }
      const opts = mcq.optionIdsByQuestion.get(q.questionId)!;
      for (const oid of q.correctOptionIds) {
        if (!opts.has(oid)) {
          issues.push(`grading question "${q.questionId}" references unknown option "${oid}"`);
        }
      }
    }
  }

  // Every MCQ unit in content must have grading (otherwise it cannot be scored).
  for (const unitId of index.mcqUnits.keys()) {
    if (!gradedUnitIds.has(unitId)) {
      issues.push(`mcq unit "${unitId}" has no grading entry`);
    }
  }

  // Certification rule: required unit ids must exist in content.
  for (const uid of rule.requiredUnitIds) {
    if (!index.unitIds.has(uid)) issues.push(`certificationRule requires unknown unit "${uid}"`);
  }

  if (issues.length) throw new ContentValidationError(issues);
  return { content, grading };
}

/** Learner-safe projection: strip grading entirely — used at every learner surface. */
export function assertNoGradingLeak(payload: unknown): void {
  const json = JSON.stringify(payload);
  if (/correctOptionIds/.test(json)) {
    throw new Error(
      "Refusing to serialise payload containing grading answers to a learner surface",
    );
  }
}

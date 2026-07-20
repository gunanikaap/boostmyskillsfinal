import type { GradingDocument } from "@/lib/content/schema";

export interface McqSubmission {
  // questionId -> selected option ids
  answers: Record<string, string[]>;
}

export interface GradeResult {
  score: number;
  maximumScore: number;
  percentage: number;
  passed: boolean;
  passMark: number;
}

/**
 * Server-side MCQ scoring. A question is correct only when the selected option
 * set EXACTLY equals the configured correct set (supports single- and
 * multi-select). All grading happens here — never from client-supplied scores.
 */
export function gradeMcq(
  grading: GradingDocument,
  unitId: string,
  submission: McqSubmission,
): GradeResult {
  const unit = grading.units.find((u) => u.unitId === unitId);
  if (!unit) throw new Error(`No grading for unit ${unitId}`);

  let score = 0;
  let maximumScore = 0;
  for (const q of unit.questions) {
    maximumScore += q.points;
    const selected = new Set(submission.answers[q.questionId] ?? []);
    const correct = new Set(q.correctOptionIds);
    const exact = selected.size === correct.size && [...correct].every((id) => selected.has(id));
    if (exact) score += q.points;
  }
  const percentage = maximumScore === 0 ? 0 : Math.round((score / maximumScore) * 10000) / 100;
  return {
    score,
    maximumScore,
    percentage,
    passMark: unit.passMark,
    passed: percentage >= unit.passMark,
  };
}

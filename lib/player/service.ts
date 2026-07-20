import { db, type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { AccessError } from "@/lib/access/errors";
import { gradeMcq, type GradeResult } from "@/lib/player/grade";
import { issueCertificateIfEligible } from "@/lib/certificates/service";
import type { ContentDocument, GradingDocument } from "@/lib/content/schema";

interface AssignedVersion {
  enrollmentId: string;
  credentialVersionId: string;
  content: ContentDocument;
  grading: GradingDocument;
}

/**
 * Resolve the learner's assigned version for a credential and enforce access:
 *  - credential must be published+visible (hidden blocks ALL content access,
 *    progress writes and assessment writes — even for enrolled learners);
 *  - the learner must be enrolled;
 * The assigned content/grading come from the enrolment's bound version, never
 * the latest — so publishing new revisions never changes an existing learner.
 */
async function resolveAssigned(
  userId: string,
  credentialId: string,
  tx: Queryable,
): Promise<AssignedVersion> {
  const cred = await tx.query(`SELECT status FROM micro_credentials WHERE id = $1`, [credentialId]);
  const status = (cred.rows[0] as { status: string } | undefined)?.status;
  if (!status || status === "draft") throw new AccessError("not_found");
  if (status === "hidden") throw new AccessError("hidden");

  const enr = await tx.query(
    `SELECT e.id, e.credential_version_id,
            cv.content_document, cv.grading_document
     FROM enrollments e
     JOIN credential_versions cv ON cv.id = e.credential_version_id
     WHERE e.user_id = $1 AND e.credential_id = $2`,
    [userId, credentialId],
  );
  const row = enr.rows[0] as
    | {
        id: string;
        credential_version_id: string;
        content_document: ContentDocument;
        grading_document: GradingDocument;
      }
    | undefined;
  if (!row) throw new AccessError("forbidden", "not enrolled");
  return {
    enrollmentId: row.id,
    credentialVersionId: row.credential_version_id,
    content: row.content_document,
    grading: row.grading_document,
  };
}

function collectUnit(content: ContentDocument, unitId: string) {
  for (const s of content.sections)
    for (const ss of s.subsections) for (const u of ss.units) if (u.id === unitId) return u;
  return undefined;
}

/** Learner-safe player content (NO grading document ever returned). */
export async function getLearnerContent(
  userId: string,
  credentialId: string,
  conn: Queryable = db,
): Promise<{ enrollmentId: string; content: ContentDocument }> {
  const assigned = await resolveAssigned(userId, credentialId, conn);
  return { enrollmentId: assigned.enrollmentId, content: assigned.content };
}

/** Record unit progress. Validates the unit belongs to the assigned version. */
export async function recordUnitProgress(
  input: {
    userId: string;
    credentialId: string;
    unitId: string;
    status: "not_started" | "in_progress" | "completed";
    progressPercent: number;
    state?: Record<string, unknown>;
  },
  conn?: Queryable,
): Promise<void> {
  const run = async (tx: Queryable) => {
    const assigned = await resolveAssigned(input.userId, input.credentialId, tx);
    if (!collectUnit(assigned.content, input.unitId)) {
      throw new AccessError("not_found", "unknown unit");
    }
    await tx.query(
      `INSERT INTO unit_progress
         (enrollment_id, unit_id, status, progress_percent, state, started_at, completed_at)
       VALUES ($1,$2,$3,$4,$5, now(), CASE WHEN $3='completed' THEN now() ELSE NULL END)
       ON CONFLICT (enrollment_id, unit_id) DO UPDATE SET
         status = EXCLUDED.status,
         progress_percent = GREATEST(unit_progress.progress_percent, EXCLUDED.progress_percent),
         state = unit_progress.state || EXCLUDED.state,
         completed_at = COALESCE(unit_progress.completed_at, EXCLUDED.completed_at)`,
      [
        assigned.enrollmentId,
        input.unitId,
        input.status,
        input.progressPercent,
        JSON.stringify(input.state ?? {}),
      ],
    );
  };
  return conn ? run(conn) : withTransaction(run);
}

export interface AttemptOutcome {
  attemptNumber: number;
  result: GradeResult;
  reused: boolean;
}

/**
 * Submit an MCQ attempt with the one-attempt policy enforced transactionally.
 *  - hidden credential blocks submission;
 *  - grading is loaded server-side from the assigned version and a snapshot is
 *    stored so later draft changes never recalculate historical results;
 *  - attempts beyond maxAttempts are rejected;
 *  - a double-click / concurrent retry does NOT create a second attempt
 *    (unique (enrollment, unit, attempt_number) + conflict handling → idempotent).
 */
export async function submitMcqAttempt(
  input: {
    userId: string;
    credentialId: string;
    unitId: string;
    answers: Record<string, string[]>;
  },
  conn?: Queryable,
): Promise<AttemptOutcome> {
  const run = async (tx: Queryable): Promise<AttemptOutcome> => {
    const assigned = await resolveAssigned(input.userId, input.credentialId, tx);
    const gradingUnit = assigned.grading.units.find((u) => u.unitId === input.unitId);
    if (!gradingUnit) throw new AccessError("not_found", "unit is not an assessment");

    // Lock existing attempts for this enrolment+unit to serialise concurrent submits.
    const existing = await tx.query(
      `SELECT attempt_number, score, maximum_score, percentage, passed
       FROM assessment_attempts
       WHERE enrollment_id = $1 AND unit_id = $2
       ORDER BY attempt_number DESC
       FOR UPDATE`,
      [assigned.enrollmentId, input.unitId],
    );
    const attempts = existing.rows as {
      attempt_number: number;
      score: string | null;
      maximum_score: string | null;
      percentage: string | null;
      passed: boolean | null;
    }[];

    if (attempts.length >= gradingUnit.maxAttempts) {
      // One-attempt (or N-attempt) policy: no further attempts allowed.
      throw new AccessError("forbidden", "no attempts remaining");
    }

    const attemptNumber = attempts.length + 1;
    const result = gradeMcq(assigned.grading, input.unitId, { answers: input.answers });

    try {
      await tx.query(
        `INSERT INTO assessment_attempts
           (enrollment_id, unit_id, attempt_number, submitted_answers, score, maximum_score,
            percentage, passed, grading_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          assigned.enrollmentId,
          input.unitId,
          attemptNumber,
          JSON.stringify(input.answers),
          result.score,
          result.maximumScore,
          result.percentage,
          result.passed,
          JSON.stringify(gradingUnit), // snapshot of the rules used
        ],
      );
    } catch (err) {
      // Unique violation → a concurrent submit already created this attempt.
      if ((err as { code?: string }).code === "23505") {
        const dup = await tx.query(
          `SELECT attempt_number, score, maximum_score, percentage, passed
           FROM assessment_attempts WHERE enrollment_id=$1 AND unit_id=$2 AND attempt_number=$3`,
          [assigned.enrollmentId, input.unitId, attemptNumber],
        );
        const r = dup.rows[0] as {
          attempt_number: number;
          score: string;
          maximum_score: string;
          percentage: string;
          passed: boolean;
        };
        return {
          attemptNumber: r.attempt_number,
          reused: true,
          result: {
            score: Number(r.score),
            maximumScore: Number(r.maximum_score),
            percentage: Number(r.percentage),
            passed: r.passed,
            passMark: gradingUnit.passMark,
          },
        };
      }
      throw err;
    }

    // Mark the unit complete on submission.
    await tx.query(
      `INSERT INTO unit_progress (enrollment_id, unit_id, status, progress_percent, state, completed_at)
       VALUES ($1,$2,'completed',100,'{}'::jsonb, now())
       ON CONFLICT (enrollment_id, unit_id) DO UPDATE
         SET status='completed', progress_percent=100, completed_at=COALESCE(unit_progress.completed_at, now())`,
      [assigned.enrollmentId, input.unitId],
    );

    // Automatic, idempotent certificate issuance when the learner becomes
    // eligible (US-L-15). Runs in the same transaction so a pass and its
    // certificate commit atomically.
    await issueCertificateIfEligible(assigned.enrollmentId, tx);

    return { attemptNumber, result, reused: false };
  };
  return conn ? run(conn) : withTransaction(run);
}

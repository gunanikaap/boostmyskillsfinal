import { db, type Queryable } from "@/lib/db/pool";
import type { ContentDocument } from "@/lib/content/schema";
import { calculateCredentialProgress } from "@/lib/progress/calculate";
import { unitProgressRowsByEnrolment } from "@/lib/progress/queries";

export interface LearningItem {
  enrollmentId: string;
  credentialId: string;
  slug: string;
  code: string;
  title: string;
  status: string; // credential status: published | hidden
  enrolmentStatus: string;
  progressPercent: number;
  hidden: boolean;
  hasCertificate: boolean;
}

/**
 * The learner's current credential learning. Hidden credentials are still listed
 * (enrolment preserved) but flagged so the UI shows "Temporarily unavailable"
 * with no resume link.
 */
export async function listMyLearning(
  userId: string,
  conn: Queryable = db,
): Promise<LearningItem[]> {
  const { rows } = await conn.query(
    `SELECT e.id AS enrollment_id, e.status AS enrolment_status,
            mc.id AS credential_id, mc.slug, mc.code, mc.status,
            cv.title, cv.content_document,
            EXISTS(SELECT 1 FROM certificates c WHERE c.enrollment_id = e.id AND c.status='issued') AS has_certificate
     FROM enrollments e
     JOIN micro_credentials mc ON mc.id = e.credential_id
     JOIN credential_versions cv ON cv.id = e.credential_version_id
     WHERE e.user_id = $1 AND e.credential_id IS NOT NULL AND e.status <> 'withdrawn'
     ORDER BY cv.title`,
    [userId],
  );
  const enrolments = rows as (Record<string, unknown> & {
    enrollment_id: string;
    content_document: ContentDocument;
  })[];
  // Canonical progress: computed against every assigned unit (missing row = 0).
  const rowsByEnrolment = await unitProgressRowsByEnrolment(
    enrolments.map((e) => e.enrollment_id),
    conn,
  );
  return enrolments.map((r) => ({
    enrollmentId: r.enrollment_id,
    credentialId: r.credential_id as string,
    slug: r.slug as string,
    code: r.code as string,
    title: r.title as string,
    status: r.status as string,
    enrolmentStatus: r.enrolment_status as string,
    progressPercent: calculateCredentialProgress(
      r.content_document,
      rowsByEnrolment.get(r.enrollment_id) ?? [],
    ).percent,
    hidden: (r.status as string) === "hidden",
    hasCertificate: Boolean(r.has_certificate),
  }));
}

export interface UnitState {
  status: string;
  progressPercent: number;
  attempted: boolean;
  attemptPercentage: number | null;
}

/** Per-unit progress + whether an assessment attempt exists (learner-safe). */
export async function getEnrollmentUnitState(
  enrollmentId: string,
  conn: Queryable = db,
): Promise<Record<string, UnitState>> {
  const progress = await conn.query(
    `SELECT unit_id, status, progress_percent FROM unit_progress WHERE enrollment_id = $1`,
    [enrollmentId],
  );
  const attempts = await conn.query(
    `SELECT unit_id, MAX(percentage) AS best FROM assessment_attempts
     WHERE enrollment_id = $1 GROUP BY unit_id`,
    [enrollmentId],
  );
  const attemptMap = new Map(
    (attempts.rows as { unit_id: string; best: string }[]).map((r) => [r.unit_id, Number(r.best)]),
  );
  const out: Record<string, UnitState> = {};
  for (const r of progress.rows as {
    unit_id: string;
    status: string;
    progress_percent: number;
  }[]) {
    out[r.unit_id] = {
      status: r.status,
      progressPercent: r.progress_percent,
      attempted: attemptMap.has(r.unit_id),
      attemptPercentage: attemptMap.get(r.unit_id) ?? null,
    };
  }
  for (const [unitId, best] of attemptMap) {
    if (!out[unitId]) {
      out[unitId] = {
        status: "completed",
        progressPercent: 100,
        attempted: true,
        attemptPercentage: best,
      };
    }
  }
  return out;
}

/**
 * Learner-facing MCQ outcome DTO (FCX-P1-002).
 *
 * SECURITY: this is an explicit ALLOWLIST. It carries the learner's own result
 * and their own submitted choices — never the answer key. `grading_snapshot`
 * (and any correct-option map derived from it) is server-only and must not
 * appear in learner queries, props, RSC payloads or responses.
 *
 * Do NOT add: gradingSnapshot, correctByQuestion, correctOptionIds, per-option
 * correctness flags, or internal grading rules.
 */
export interface McqReview {
  attemptNumber: number;
  percentage: number | null;
  score: number | null;
  maximumScore: number | null;
  passed: boolean | null;
  submittedAt: string;
  /** The learner's OWN selections, for read-only display of what they answered. */
  chosenByQuestion: Record<string, string[]>;
}

/**
 * Post-submission MCQ outcome for the latest attempt: score, pass/fail and the
 * learner's own answers. Null if there is no attempt yet.
 *
 * `grading_snapshot` is deliberately NOT selected — the answer key never leaves
 * the server. It remains stored in PostgreSQL as the immutable historical
 * grading record and is still used server-side for certificate eligibility.
 */
export async function getMcqReview(
  enrollmentId: string,
  unitId: string,
  conn: Queryable = db,
): Promise<McqReview | null> {
  const { rows } = await conn.query(
    `SELECT attempt_number, percentage, score, maximum_score, passed,
            submitted_at, submitted_answers
       FROM assessment_attempts
      WHERE enrollment_id = $1 AND unit_id = $2
      ORDER BY attempt_number DESC LIMIT 1`,
    [enrollmentId, unitId],
  );
  const r = rows[0] as
    | {
        attempt_number: number;
        percentage: string | null;
        score: string | null;
        maximum_score: string | null;
        passed: boolean | null;
        submitted_at: Date | string;
        submitted_answers: unknown;
      }
    | undefined;
  if (!r) return null;
  return {
    attemptNumber: Number(r.attempt_number),
    percentage: r.percentage !== null ? Number(r.percentage) : null,
    score: r.score !== null ? Number(r.score) : null,
    maximumScore: r.maximum_score !== null ? Number(r.maximum_score) : null,
    passed: r.passed,
    submittedAt:
      r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at),
    chosenByQuestion: (r.submitted_answers as Record<string, string[]>) ?? {},
  };
}

export interface CertificateListItem {
  verificationCode: string;
  credentialTitle: string;
  credentialCode: string;
  issueDate: string;
  status: string;
}

export async function listMyCertificates(
  userId: string,
  conn: Queryable = db,
): Promise<CertificateListItem[]> {
  const { rows } = await conn.query(
    `SELECT c.verification_code, c.status, c.certificate_snapshot, c.issued_at
     FROM certificates c
     JOIN enrollments e ON e.id = c.enrollment_id
     WHERE e.user_id = $1
     ORDER BY c.issued_at DESC`,
    [userId],
  );
  return (rows as Record<string, unknown>[]).map((r) => {
    const s = r.certificate_snapshot as Record<string, unknown>;
    return {
      verificationCode: r.verification_code as string,
      credentialTitle: (s.credentialTitle as string) ?? "",
      credentialCode: (s.credentialCode as string) ?? "",
      issueDate: (s.issueDate as string) ?? (r.issued_at as string),
      status: r.status as string,
    };
  });
}

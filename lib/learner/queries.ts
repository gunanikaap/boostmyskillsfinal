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

export interface McqReview {
  percentage: number | null;
  correctByQuestion: Record<string, string[]>;
  chosenByQuestion: Record<string, string[]>;
}

/**
 * Post-submission MCQ review: the correct option ids (from the recorded grading
 * snapshot) and the learner's own answers, for the latest attempt. Only ever
 * exposed AFTER the learner has submitted — the content_document never carries
 * answers. Null if there is no attempt yet.
 */
export async function getMcqReview(
  enrollmentId: string,
  unitId: string,
  conn: Queryable = db,
): Promise<McqReview | null> {
  const { rows } = await conn.query(
    `SELECT percentage, submitted_answers, grading_snapshot
     FROM assessment_attempts
     WHERE enrollment_id = $1 AND unit_id = $2
     ORDER BY attempt_number DESC LIMIT 1`,
    [enrollmentId, unitId],
  );
  const r = rows[0] as
    | { percentage: string | null; submitted_answers: unknown; grading_snapshot: unknown }
    | undefined;
  if (!r) return null;
  const snap = r.grading_snapshot as {
    questions?: { questionId: string; correctOptionIds: string[] }[];
  };
  const correctByQuestion: Record<string, string[]> = {};
  for (const q of snap.questions ?? []) correctByQuestion[q.questionId] = q.correctOptionIds;
  return {
    percentage: r.percentage !== null ? Number(r.percentage) : null,
    correctByQuestion,
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

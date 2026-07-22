import { db, type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { randomUUID } from "node:crypto";
import type { ContentDocument, GradingDocument, CertificationRule } from "@/lib/content/schema";

export interface CredentialResult {
  percentage: number;
  passed: boolean;
  threshold: number;
  requiredUnitsComplete: boolean;
}

interface EnrolmentContext {
  userId: string;
  credentialId: string;
  versionId: string;
  content: ContentDocument;
  grading: GradingDocument;
  rule: CertificationRule;
  learnerName: string;
  credentialTitle: string;
  credentialCode: string;
  projectName: string;
  organisationName: string;
  issuerName: string;
}

async function loadContext(enrollmentId: string, tx: Queryable): Promise<EnrolmentContext | null> {
  const { rows } = await tx.query(
    `SELECT e.user_id, e.credential_id, e.credential_version_id,
            cv.content_document, cv.grading_document, cv.certification_rule,
            cv.title AS credential_title, mc.code AS credential_code,
            p.name AS project_name, p.organisation_name, p.certificate_template,
            u.first_name, u.last_name, u.email
     FROM enrollments e
     JOIN credential_versions cv ON cv.id = e.credential_version_id
     JOIN micro_credentials mc ON mc.id = e.credential_id
     JOIN projects p ON p.id = mc.project_id
     JOIN app_users u ON u.id = e.user_id
     WHERE e.id = $1 AND e.credential_id IS NOT NULL`,
    [enrollmentId],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  const template = r.certificate_template as { issuerName?: string };
  const first = (r.first_name as string) ?? "";
  const last = (r.last_name as string) ?? "";
  const learnerName = `${first} ${last}`.trim() || (r.email as string);
  return {
    userId: r.user_id as string,
    credentialId: r.credential_id as string,
    versionId: r.credential_version_id as string,
    content: r.content_document as ContentDocument,
    grading: r.grading_document as GradingDocument,
    rule: r.certification_rule as CertificationRule,
    learnerName,
    credentialTitle: r.credential_title as string,
    credentialCode: r.credential_code as string,
    projectName: r.project_name as string,
    organisationName: r.organisation_name as string,
    issuerName: template?.issuerName ?? (r.organisation_name as string),
  };
}

/**
 * Compute the credential result server-side:
 *  - percentage = mean of best attempt percentage across graded (MCQ) units;
 *    if there are no graded units, 100 when all required units are complete;
 *  - required units (from the certification rule) must all be completed;
 *  - passed = percentage >= threshold AND required units complete.
 */
export async function computeCredentialResult(
  enrollmentId: string,
  conn: Queryable = db,
): Promise<CredentialResult | null> {
  const ctx = await loadContext(enrollmentId, conn);
  if (!ctx) return null;
  const threshold = ctx.rule.thresholdPercent;

  const gradedUnitIds = ctx.grading.units.map((u) => u.unitId);
  let percentage = 100;
  if (gradedUnitIds.length > 0) {
    const best = await conn.query(
      `SELECT unit_id, MAX(percentage) AS best
       FROM assessment_attempts WHERE enrollment_id = $1 AND unit_id = ANY($2)
       GROUP BY unit_id`,
      [enrollmentId, gradedUnitIds],
    );
    const map = new Map(
      (best.rows as { unit_id: string; best: string }[]).map((r) => [r.unit_id, Number(r.best)]),
    );
    const total = gradedUnitIds.reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
    percentage = Math.round((total / gradedUnitIds.length) * 100) / 100;
  }

  let requiredUnitsComplete = true;
  if (ctx.rule.requiredUnitIds.length > 0) {
    const done = await conn.query(
      `SELECT count(*)::int c FROM unit_progress
       WHERE enrollment_id = $1 AND unit_id = ANY($2) AND status = 'completed'`,
      [enrollmentId, ctx.rule.requiredUnitIds],
    );
    requiredUnitsComplete = (done.rows[0] as { c: number }).c === ctx.rule.requiredUnitIds.length;
  }

  return {
    percentage,
    threshold,
    requiredUnitsComplete,
    passed: percentage >= threshold && requiredUnitsComplete,
  };
}

/** The issued certificate for an enrolment, if any. */
export async function getEnrollmentCertificate(
  enrollmentId: string,
  conn: Queryable = db,
): Promise<{ verificationCode: string } | null> {
  const { rows } = await conn.query(
    `SELECT verification_code FROM certificates WHERE enrollment_id = $1 AND status = 'issued'`,
    [enrollmentId],
  );
  const r = rows[0] as { verification_code: string } | undefined;
  return r ? { verificationCode: r.verification_code } : null;
}

export interface IssueOutcome {
  issued: boolean;
  reused: boolean;
  certificateId?: string;
  verificationCode?: string;
}

function makeVerificationCode(): string {
  // Public, unguessable, URL-safe. No PII.
  return randomUUID().replace(/-/g, "");
}

/**
 * Idempotent certificate issuance. Issues only when eligible; a repeat call for
 * an already-certified enrolment returns the existing certificate (never a
 * duplicate — enforced by the unique enrollment_id + conflict handling).
 */
export async function issueCertificateIfEligible(
  enrollmentId: string,
  conn?: Queryable,
): Promise<IssueOutcome> {
  const run = async (tx: Queryable): Promise<IssueOutcome> => {
    const existing = await tx.query(
      `SELECT id, verification_code FROM certificates WHERE enrollment_id = $1`,
      [enrollmentId],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0] as { id: string; verification_code: string };
      return {
        issued: false,
        reused: true,
        certificateId: r.id,
        verificationCode: r.verification_code,
      };
    }

    const result = await computeCredentialResult(enrollmentId, tx);
    if (!result || !result.passed) return { issued: false, reused: false };

    const ctx = (await loadContext(enrollmentId, tx))!;
    const verificationCode = makeVerificationCode();
    const snapshot = {
      learnerName: ctx.learnerName,
      credentialTitle: ctx.credentialTitle,
      credentialCode: ctx.credentialCode,
      projectName: ctx.projectName,
      organisationName: ctx.organisationName,
      issuerName: ctx.issuerName,
      resultPercentage: result.percentage,
      passed: result.passed,
      issueDate: new Date().toISOString(),
      revisionId: ctx.versionId,
      verificationCode,
    };

    try {
      const ins = await tx.query(
        `INSERT INTO certificates (verification_code, enrollment_id, status, certificate_snapshot)
         VALUES ($1,$2,'issued',$3) RETURNING id`,
        [verificationCode, enrollmentId, JSON.stringify(snapshot)],
      );
      // Reflect completion on the enrolment.
      await tx.query(
        `UPDATE enrollments SET status='completed', completed_at=now(),
           final_percentage=$2, passed=true WHERE id=$1`,
        [enrollmentId, result.percentage],
      );
      return {
        issued: true,
        reused: false,
        certificateId: (ins.rows[0] as { id: string }).id,
        verificationCode,
      };
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        const dup = await tx.query(
          `SELECT id, verification_code FROM certificates WHERE enrollment_id = $1`,
          [enrollmentId],
        );
        const r = dup.rows[0] as { id: string; verification_code: string };
        return {
          issued: false,
          reused: true,
          certificateId: r.id,
          verificationCode: r.verification_code,
        };
      }
      throw err;
    }
  };
  return conn ? run(conn) : withTransaction(run);
}

// --- Public verification (no PII beyond approved fields) ---------------------

export interface PublicVerification {
  status: "issued" | "revoked";
  learnerName: string;
  credentialTitle: string;
  credentialCode: string;
  organisationName: string;
  issuerName: string;
  issueDate: string;
  verificationCode: string;
  revoked: boolean;
}

export async function verifyCertificate(
  verificationCode: string,
  conn: Queryable = db,
): Promise<PublicVerification | null> {
  const { rows } = await conn.query(
    `SELECT status, certificate_snapshot, issued_at FROM certificates WHERE verification_code = $1`,
    [verificationCode],
  );
  const r = rows[0] as
    | {
        status: "issued" | "revoked";
        certificate_snapshot: Record<string, unknown>;
        issued_at: string;
      }
    | undefined;
  if (!r) return null;
  const s = r.certificate_snapshot;
  return {
    status: r.status,
    revoked: r.status === "revoked",
    learnerName: (s.learnerName as string) ?? "",
    credentialTitle: (s.credentialTitle as string) ?? "",
    credentialCode: (s.credentialCode as string) ?? "",
    organisationName: (s.organisationName as string) ?? "",
    issuerName: (s.issuerName as string) ?? "",
    issueDate: (s.issueDate as string) ?? r.issued_at,
    verificationCode,
  };
}

export async function revokeCertificate(
  enrollmentId: string,
  reason: string,
  conn: Queryable = db,
): Promise<void> {
  await conn.query(
    `UPDATE certificates SET status='revoked', revoked_at=now(), revocation_reason=$2
     WHERE enrollment_id = $1`,
    [enrollmentId, reason],
  );
}

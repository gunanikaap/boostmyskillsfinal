import { db, type Queryable } from "@/lib/db/pool";
import type { ContentDocument } from "@/lib/content/schema";
import { calculateCredentialProgress } from "@/lib/progress/calculate";
import { unitProgressRowsByEnrolment } from "@/lib/progress/queries";

export interface AnalyticsFilter {
  projectId?: string;
  programmeId?: string;
  credentialId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
}

export interface AnalyticsRow {
  learnerName: string;
  credentialCode: string;
  credentialTitle: string;
  progressPercent: number;
  completed: boolean;
  lastAccess: string | null;
  finalPercentage: number | null;
  passed: boolean | null;
  enrolledAt: string;
}

/**
 * Enrolment analytics across credential enrolments, with optional project /
 * programme / credential / date-range filters. Admin-only (callers pass through
 * requireAdmin()). Learner identity is a display name, not email.
 */
export async function adminEnrolmentAnalytics(
  filter: AnalyticsFilter,
  conn: Queryable = db,
): Promise<AnalyticsRow[]> {
  const where: string[] = ["e.credential_id IS NOT NULL"];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("$?", `$${params.length}`));
  };
  if (filter.credentialId) add("e.credential_id = $?", filter.credentialId);
  if (filter.projectId) add("mc.project_id = $?", filter.projectId);
  if (filter.programmeId)
    add(
      "e.user_id IN (SELECT user_id FROM enrollments WHERE programme_id = $?)",
      filter.programmeId,
    );
  if (filter.from) add("e.enrolled_at >= $?", filter.from);
  if (filter.to) add("e.enrolled_at <= $?", filter.to);

  const { rows } = await conn.query(
    `SELECT
       e.id AS enrollment_id,
       COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) AS learner_name,
       mc.code AS credential_code,
       cv.title AS credential_title,
       cv.content_document,
       (e.status = 'completed') AS completed,
       e.last_accessed_at,
       e.final_percentage,
       e.passed,
       e.enrolled_at
     FROM enrollments e
     JOIN app_users u ON u.id = e.user_id
     JOIN micro_credentials mc ON mc.id = e.credential_id
     JOIN credential_versions cv ON cv.id = e.credential_version_id
     WHERE ${where.join(" AND ")}
     ORDER BY cv.title, learner_name`,
    params,
  );
  const enrolments = rows as (Record<string, unknown> & {
    enrollment_id: string;
    content_document: ContentDocument;
  })[];
  // Canonical progress against every assigned unit (not AVG over existing rows).
  const rowsByEnrolment = await unitProgressRowsByEnrolment(
    enrolments.map((r) => r.enrollment_id),
    conn,
  );
  return enrolments.map((r) => ({
    learnerName: r.learner_name as string,
    credentialCode: r.credential_code as string,
    credentialTitle: r.credential_title as string,
    progressPercent: calculateCredentialProgress(
      r.content_document,
      rowsByEnrolment.get(r.enrollment_id) ?? [],
    ).percent,
    completed: Boolean(r.completed),
    // pg returns timestamptz as a JS Date; normalise to an ISO string so both the
    // CSV and the analytics page (which slices the date) get a real string.
    lastAccess:
      r.last_accessed_at == null ? null : new Date(r.last_accessed_at as string).toISOString(),
    finalPercentage: r.final_percentage === null ? null : Number(r.final_percentage),
    passed: r.passed === null ? null : Boolean(r.passed),
    enrolledAt: new Date(r.enrolled_at as string).toISOString(),
  }));
}

/** RFC-4180-safe CSV serialisation. */
export function analyticsToCsv(rows: AnalyticsRow[]): string {
  const header = [
    "learner_name",
    "credential_code",
    "credential_title",
    "progress_percent",
    "completed",
    "last_access",
    "final_percentage",
    "passed",
    "enrolled_at",
  ];
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.learnerName,
        r.credentialCode,
        r.credentialTitle,
        r.progressPercent,
        r.completed,
        r.lastAccess ?? "",
        r.finalPercentage ?? "",
        r.passed ?? "",
        r.enrolledAt,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

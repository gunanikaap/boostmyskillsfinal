import { db, type Queryable } from "@/lib/db/pool";
import type { ContentDocument } from "@/lib/content/schema";
import { calculateCredentialProgress } from "@/lib/progress/calculate";
import { unitProgressRowsByEnrolment } from "@/lib/progress/queries";
import { csvRow } from "@/lib/export/csv";

export interface AnalyticsFilter {
  userId?: string;
  organisationName?: string;
  /**
   * Funded-project NAME (not a row id). The projects table holds one row per
   * (project × organisation), so several rows share a name (e.g. RES4CITY);
   * filtering by name selects the whole funded project across organisations,
   * and keeps the picker free of duplicates. Organisation is a separate filter.
   */
  projectName?: string;
  programmeId?: string;
  credentialId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
}

export interface AnalyticsRow {
  learnerName: string;
  organisationName: string;
  projectName: string;
  credentialCode: string;
  credentialTitle: string;
  progressPercent: number;
  completed: boolean;
  lastAccess: string | null;
  finalPercentage: number | null;
  passed: boolean | null;
  enrolledAt: string;
}

/** Option lists for the analytics filter UI. */
export interface AnalyticsOptions {
  learners: { id: string; name: string }[];
  organisations: string[];
  projects: string[]; // distinct funded-project names
  programmes: { id: string; title: string }[];
  credentials: { id: string; label: string }[];
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
  if (filter.userId) add("e.user_id = $?", filter.userId);
  if (filter.organisationName) add("p.organisation_name = $?", filter.organisationName);
  if (filter.credentialId) add("e.credential_id = $?", filter.credentialId);
  if (filter.projectName) add("p.name = $?", filter.projectName);
  if (filter.programmeId)
    add(
      "e.user_id IN (SELECT user_id FROM enrollments WHERE programme_id = $?)",
      filter.programmeId,
    );
  if (filter.from) add("e.enrolled_at >= $?", filter.from);
  // `to` is a calendar day → include the whole day (< next midnight).
  if (filter.to) add("e.enrolled_at < ($? ::date + interval '1 day')", filter.to);

  const { rows } = await conn.query(
    `SELECT
       e.id AS enrollment_id,
       COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) AS learner_name,
       p.organisation_name,
       p.name AS project_name,
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
     JOIN projects p ON p.id = mc.project_id
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
    organisationName: r.organisation_name as string,
    projectName: r.project_name as string,
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
    "organisation",
    "project",
    "credential_code",
    "credential_title",
    "progress_percent",
    "completed",
    "last_access",
    "final_percentage",
    "passed",
    "enrolled_at",
  ];
  // Central CSV-cell sanitiser: formula-injection guard + RFC-4180 quoting.
  const lines = [csvRow(header)];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.learnerName,
        r.organisationName,
        r.projectName,
        r.credentialCode,
        r.credentialTitle,
        r.progressPercent,
        r.completed,
        r.lastAccess ?? "",
        r.finalPercentage ?? "",
        r.passed ?? "",
        r.enrolledAt,
      ]),
    );
  }
  return lines.join("\r\n");
}

/**
 * Aggregate figures for the filtered result set (calculated server-side).
 *
 * NOTE on pass/fail: an enrolment's `passed` flag is only ever set to `true`
 * (on certificate issuance); a learner who finishes but doesn't meet the pass
 * criteria is never persisted as `passed = false`. Reporting a "pass rate" over
 * such data is therefore structurally always 100% and misleading, so we report
 * honest completion metrics (completed / in-progress / average progress)
 * instead. "Completed" here is exactly the set that earned a certificate.
 */
export interface AnalyticsSummary {
  enrolments: number;
  learners: number;
  completed: number;
  inProgress: number;
  completionRate: number; // % of enrolments completed (= certified)
  averageProgress: number; // %
}

export function summariseAnalytics(rows: AnalyticsRow[]): AnalyticsSummary {
  const enrolments = rows.length;
  const learners = new Set(rows.map((r) => r.learnerName)).size;
  const completed = rows.filter((r) => r.completed).length;
  const round = (n: number) => Math.round(n);
  return {
    enrolments,
    learners,
    completed,
    inProgress: enrolments - completed,
    completionRate: enrolments ? round((completed / enrolments) * 100) : 0,
    averageProgress: enrolments
      ? round(rows.reduce((s, r) => s + r.progressPercent, 0) / enrolments)
      : 0,
  };
}

/** Option lists that populate the analytics filter controls. */
export async function analyticsFilterOptions(conn: Queryable = db): Promise<AnalyticsOptions> {
  const [learners, organisations, projects, programmes, credentials] = await Promise.all([
    conn.query(
      `SELECT u.id,
              COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) AS name
       FROM app_users u
       WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.credential_id IS NOT NULL)
       ORDER BY name`,
    ),
    conn.query(`SELECT DISTINCT organisation_name FROM projects ORDER BY organisation_name`),
    conn.query(`SELECT DISTINCT name FROM projects ORDER BY name`),
    conn.query(`SELECT id, title FROM micro_programmes ORDER BY title`),
    conn.query(
      `SELECT mc.id, mc.code,
              (SELECT v.title FROM credential_versions v
                 WHERE v.credential_id = mc.id
                 ORDER BY (v.status = 'published') DESC, v.revision_number DESC
                 LIMIT 1) AS title
       FROM micro_credentials mc
       ORDER BY mc.code`,
    ),
  ]);

  return {
    learners: (learners.rows as { id: string; name: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
    })),
    organisations: (organisations.rows as { organisation_name: string }[]).map(
      (r) => r.organisation_name,
    ),
    projects: (projects.rows as { name: string }[]).map((r) => r.name),
    programmes: (programmes.rows as { id: string; title: string }[]).map((r) => ({
      id: r.id,
      title: r.title,
    })),
    credentials: (credentials.rows as { id: string; code: string; title: string | null }[]).map(
      (r) => ({ id: r.id, label: `${r.code} — ${r.title ?? "Untitled"}` }),
    ),
  };
}

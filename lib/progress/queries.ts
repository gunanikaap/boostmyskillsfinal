import { db, type Queryable } from "@/lib/db/pool";
import type { ContentDocument } from "@/lib/content/schema";
import {
  calculateCredentialProgress,
  type CredentialProgressView,
  type UnitProgressRow,
} from "@/lib/progress/calculate";

/**
 * DB glue for the canonical progress calculation. Always calculates against the
 * enrolment's BOUND `credential_version.content_document`, so an existing
 * learner's progress is unaffected by later revisions.
 */

/** Load unit_progress rows for many enrolments at once, grouped by enrolment id. */
export async function unitProgressRowsByEnrolment(
  enrollmentIds: string[],
  conn: Queryable = db,
): Promise<Map<string, UnitProgressRow[]>> {
  const map = new Map<string, UnitProgressRow[]>();
  if (enrollmentIds.length === 0) return map;
  const { rows } = await conn.query(
    `SELECT enrollment_id, unit_id, status, progress_percent
       FROM unit_progress WHERE enrollment_id = ANY($1)`,
    [enrollmentIds],
  );
  for (const r of rows as {
    enrollment_id: string;
    unit_id: string;
    status: string;
    progress_percent: number;
  }[]) {
    const list = map.get(r.enrollment_id) ?? [];
    list.push({ unitId: r.unit_id, status: r.status, progressPercent: Number(r.progress_percent) });
    map.set(r.enrollment_id, list);
  }
  return map;
}

/** Full canonical progress hierarchy for one credential enrolment (bound revision). */
export async function getCredentialProgress(
  enrollmentId: string,
  conn: Queryable = db,
): Promise<CredentialProgressView | null> {
  const { rows } = await conn.query(
    `SELECT cv.content_document
       FROM enrollments e JOIN credential_versions cv ON cv.id = e.credential_version_id
      WHERE e.id = $1`,
    [enrollmentId],
  );
  const content = (rows[0] as { content_document: ContentDocument } | undefined)?.content_document;
  if (!content) return null;
  const progressRows =
    (await unitProgressRowsByEnrolment([enrollmentId], conn)).get(enrollmentId) ?? [];
  return calculateCredentialProgress(content, progressRows);
}

/** Convenience: just the credential percentage for a single enrolment. */
export async function getCredentialProgressPercent(
  enrollmentId: string,
  conn: Queryable = db,
): Promise<number> {
  return (await getCredentialProgress(enrollmentId, conn))?.percent ?? 0;
}

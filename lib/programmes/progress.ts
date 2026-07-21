import { db, type Queryable } from "@/lib/db/pool";
import type { ProgressStatus } from "@/lib/progress/calculate";
import { getCredentialProgress } from "@/lib/progress/queries";
import { roundPercent } from "@/lib/progress/calculate";
import type { ProgrammeRegistrationSnapshot } from "@/lib/enrolments/service";

/**
 * Learner-facing programme aggregate progress (US-L-14).
 *
 * Reads the IMMUTABLE registration snapshot stored on the programme enrolment
 * (enrollments.metadata), NOT the current programme_credentials table — so later
 * programme edits or new credential revisions never mutate an existing learner's
 * membership or aggregate. Each member's progress is the canonical calculation
 * against that member's reused credential enrolment (its bound revision).
 *
 * Aggregate rule (documented, this release):
 *  - include every credential in the enrolment snapshot;
 *  - aggregate = arithmetic mean of the member credential percentages (rounded);
 *  - a member counts as complete only at 100%;
 *  - a shared direct/programme credential is counted once (the snapshot references
 *    a single reused credential enrolment per credential).
 */

export interface ProgrammeMemberProgress {
  credentialId: string;
  enrollmentId: string;
  code: string;
  title: string;
  slug: string;
  percent: number;
  status: ProgressStatus;
  hidden: boolean; // credential hidden → temporarily unavailable
}

export interface ProgrammeProgress {
  programmeId: string;
  programmeEnrollmentId: string;
  title: string;
  slug: string;
  programmeStatus: string; // published | hidden
  hidden: boolean;
  aggregatePercent: number;
  completedCount: number;
  totalCount: number;
  members: ProgrammeMemberProgress[];
}

export async function listMyProgrammeProgress(
  userId: string,
  conn: Queryable = db,
): Promise<ProgrammeProgress[]> {
  const { rows: enrolments } = await conn.query(
    `SELECT e.id AS programme_enrollment_id, e.metadata,
            mp.id AS programme_id, mp.title, mp.slug, mp.status
       FROM enrollments e
       JOIN micro_programmes mp ON mp.id = e.programme_id
      WHERE e.user_id = $1 AND e.programme_id IS NOT NULL
      ORDER BY mp.title`,
    [userId],
  );

  const out: ProgrammeProgress[] = [];
  for (const e of enrolments as {
    programme_enrollment_id: string;
    metadata: { registration?: ProgrammeRegistrationSnapshot } | null;
    programme_id: string;
    title: string;
    slug: string;
    status: string;
  }[]) {
    // The immutable registration snapshot lives at metadata.registration.
    const snapshot = e.metadata?.registration;
    const enrolmentIds = Object.values(snapshot?.credentialEnrollmentIds ?? {});
    // Member credential metadata for the snapshot's reused enrolments.
    const metaRows = enrolmentIds.length
      ? (
          await conn.query(
            `SELECT ce.id AS enrollment_id, mc.id AS credential_id, mc.code, mc.slug, mc.status,
                    cv.title
               FROM enrollments ce
               JOIN micro_credentials mc ON mc.id = ce.credential_id
               JOIN credential_versions cv ON cv.id = ce.credential_version_id
              WHERE ce.id = ANY($1)`,
            [enrolmentIds],
          )
        ).rows
      : [];

    const members: ProgrammeMemberProgress[] = [];
    for (const m of metaRows as {
      enrollment_id: string;
      credential_id: string;
      code: string;
      slug: string;
      status: string;
      title: string;
    }[]) {
      const prog = await getCredentialProgress(m.enrollment_id, conn);
      members.push({
        credentialId: m.credential_id,
        enrollmentId: m.enrollment_id,
        code: m.code,
        title: m.title,
        slug: m.slug,
        percent: prog?.percent ?? 0,
        status: prog?.status ?? "not_started",
        hidden: m.status === "hidden",
      });
    }
    members.sort((a, b) => a.title.localeCompare(b.title));

    const aggregatePercent = members.length
      ? roundPercent(members.reduce((s, m) => s + m.percent, 0) / members.length)
      : 0;
    out.push({
      programmeId: e.programme_id,
      programmeEnrollmentId: e.programme_enrollment_id,
      title: e.title,
      slug: e.slug,
      programmeStatus: e.status,
      hidden: e.status === "hidden",
      aggregatePercent,
      completedCount: members.filter((m) => m.percent === 100).length,
      totalCount: members.length,
      members,
    });
  }
  return out;
}

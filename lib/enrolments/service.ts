import { db, type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { ServiceError } from "@/lib/credentials/service";

/**
 * Enrolment and programme-registration services. All are idempotent and
 * transactional. Enrolment always resolves the CURRENT published revision at the
 * moment of enrolment and binds the enrolment to that revision id, so later
 * publication of new revisions never changes an existing learner's content.
 */

async function currentPublishedVersion(credentialId: string, tx: Queryable): Promise<string> {
  const { rows } = await tx.query(
    `SELECT id FROM credential_versions WHERE credential_id = $1 AND status = 'published'`,
    [credentialId],
  );
  const row = rows[0] as { id: string } | undefined;
  if (!row) throw new ServiceError("not_publishable", "Credential has no published revision");
  return row.id;
}

async function assertCredentialPublished(credentialId: string, tx: Queryable): Promise<void> {
  const { rows } = await tx.query(`SELECT status FROM micro_credentials WHERE id = $1`, [
    credentialId,
  ]);
  const row = rows[0] as { status: string } | undefined;
  if (!row) throw new ServiceError("not_found", "Credential not found");
  if (row.status !== "published") {
    throw new ServiceError("not_enrollable", "Credential is not open for enrolment");
  }
}

/**
 * Direct credential enrolment. Idempotent: a concurrent/repeat call reuses the
 * existing enrolment (via the partial unique index + ON CONFLICT).
 */
export async function enrolInCredential(
  userId: string,
  credentialId: string,
  conn?: Queryable,
): Promise<{ enrollmentId: string; reused: boolean }> {
  const run = async (tx: Queryable) => {
    await assertCredentialPublished(credentialId, tx);
    const versionId = await currentPublishedVersion(credentialId, tx);
    const res = await tx.query(
      `INSERT INTO enrollments (user_id, credential_id, credential_version_id, status)
       VALUES ($1,$2,$3,'enrolled')
       ON CONFLICT (user_id, credential_id) WHERE credential_id IS NOT NULL
       DO UPDATE SET status = 'enrolled', credential_version_id = EXCLUDED.credential_version_id
       WHERE enrollments.status = 'withdrawn'
       RETURNING id`,
      [userId, credentialId, versionId],
    );
    if (res.rows[0]) {
      return { enrollmentId: (res.rows[0] as { id: string }).id, reused: false };
    }
    const existing = await tx.query(
      `SELECT id FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
      [userId, credentialId],
    );
    return { enrollmentId: (existing.rows[0] as { id: string }).id, reused: true };
  };
  return conn ? run(conn) : withTransaction(run);
}

export interface ProgrammeRegistrationSnapshot {
  programmeCredentialIds: string[];
  selectedCredentialVersionIds: Record<string, string>;
  credentialEnrollmentIds: Record<string, string>;
  registeredAt: string;
}

/**
 * Programme registration (§3.8). In one transaction:
 *  1. confirm programme published;
 *  2. confirm all required linked credentials publishable;
 *  3. create/reuse the programme enrolment;
 *  4. resolve each credential's current published revision;
 *  5. create/reuse one credential enrolment per credential (no duplicate direct
 *     or cross-programme enrolment);
 *  6. store a snapshot in the programme enrolment metadata.
 * Programme progress is computed from this snapshot, so later revisions don't
 * change an existing learner's assigned content.
 */
export async function registerForProgramme(
  userId: string,
  programmeId: string,
  conn?: Queryable,
): Promise<{ programmeEnrollmentId: string }> {
  const run = async (tx: Queryable) => {
    const progRes = await tx.query(`SELECT status FROM micro_programmes WHERE id = $1`, [
      programmeId,
    ]);
    const prog = progRes.rows[0] as { status: string } | undefined;
    if (!prog) throw new ServiceError("not_found", "Programme not found");
    if (prog.status !== "published") {
      throw new ServiceError("not_registerable", "Programme is not open for registration");
    }

    const memRes = await tx.query(
      `SELECT pc.credential_id, pc.is_required, mc.status
       FROM programme_credentials pc
       JOIN micro_credentials mc ON mc.id = pc.credential_id
       WHERE pc.programme_id = $1
       ORDER BY pc.position`,
      [programmeId],
    );
    const members = memRes.rows as {
      credential_id: string;
      is_required: boolean;
      status: string;
    }[];
    for (const m of members) {
      if (m.is_required && m.status !== "published") {
        throw new ServiceError("member_unavailable", "A required credential is not available");
      }
    }

    // create/reuse programme enrolment
    const progEnr = await tx.query(
      `INSERT INTO enrollments (user_id, programme_id, status)
       VALUES ($1,$2,'enrolled')
       ON CONFLICT (user_id, programme_id) WHERE programme_id IS NOT NULL
       DO UPDATE SET status = 'enrolled'
       WHERE enrollments.status = 'withdrawn'
       RETURNING id`,
      [userId, programmeId],
    );
    let programmeEnrollmentId: string;
    if (progEnr.rows[0]) {
      programmeEnrollmentId = (progEnr.rows[0] as { id: string }).id;
    } else {
      const ex = await tx.query(`SELECT id FROM enrollments WHERE user_id=$1 AND programme_id=$2`, [
        userId,
        programmeId,
      ]);
      programmeEnrollmentId = (ex.rows[0] as { id: string }).id;
    }

    const selectedVersions: Record<string, string> = {};
    const credEnrolments: Record<string, string> = {};
    for (const m of members) {
      if (m.status !== "published") continue; // skip optional unavailable members
      const versionId = await currentPublishedVersion(m.credential_id, tx);
      selectedVersions[m.credential_id] = versionId;
      const { enrollmentId } = await enrolInCredential(userId, m.credential_id, tx);
      credEnrolments[m.credential_id] = enrollmentId;
    }

    const snapshot: ProgrammeRegistrationSnapshot = {
      programmeCredentialIds: members.map((m) => m.credential_id),
      selectedCredentialVersionIds: selectedVersions,
      credentialEnrollmentIds: credEnrolments,
      registeredAt: new Date().toISOString(),
    };
    await tx.query(`UPDATE enrollments SET metadata = metadata || $2::jsonb WHERE id = $1`, [
      programmeEnrollmentId,
      JSON.stringify({ registration: snapshot }),
    ]);

    return { programmeEnrollmentId };
  };
  return conn ? run(conn) : withTransaction(run);
}

/**
 * Withdraw from a PROGRAMME only. The member micro-credential enrolments are
 * intentionally left intact — the learner stays enrolled in the individual
 * courses and can unenrol from them separately. Uses the 'withdrawn' status (not
 * DELETE) so progress/certificates are preserved and a later re-registration
 * reactivates the programme enrolment.
 */
export async function unregisterFromProgramme(
  userId: string,
  programmeId: string,
  conn: Queryable = db,
): Promise<void> {
  await conn.query(
    `UPDATE enrollments SET status = 'withdrawn'
     WHERE user_id = $1 AND programme_id = $2 AND status <> 'withdrawn'`,
    [userId, programmeId],
  );
}

/** Withdraw from a single micro-credential (progress/certificate preserved). */
export async function unenrolFromCredential(
  userId: string,
  credentialId: string,
  conn: Queryable = db,
): Promise<void> {
  await conn.query(
    `UPDATE enrollments SET status = 'withdrawn'
     WHERE user_id = $1 AND credential_id = $2 AND status <> 'withdrawn'`,
    [userId, credentialId],
  );
}

/** Is the user currently enrolled (non-withdrawn) in this credential? */
export async function isEnrolledInCredential(
  userId: string,
  credentialId: string,
  conn: Queryable = db,
): Promise<boolean> {
  const { rows } = await conn.query(
    `SELECT 1 FROM enrollments
     WHERE user_id = $1 AND credential_id = $2 AND status <> 'withdrawn' LIMIT 1`,
    [userId, credentialId],
  );
  return rows.length > 0;
}

/** Is the user currently registered (non-withdrawn) for this programme? */
export async function isRegisteredForProgramme(
  userId: string,
  programmeId: string,
  conn: Queryable = db,
): Promise<boolean> {
  const { rows } = await conn.query(
    `SELECT 1 FROM enrollments
     WHERE user_id = $1 AND programme_id = $2 AND status <> 'withdrawn' LIMIT 1`,
    [userId, programmeId],
  );
  return rows.length > 0;
}

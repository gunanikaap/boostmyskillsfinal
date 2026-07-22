import { db, type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { sanitizeHtml } from "@/lib/content/sanitize";
import { ServiceError } from "@/lib/credentials/service";

export async function createProgramme(
  input: {
    projectId: string;
    slug: string;
    title: string;
    shortDescription?: string;
    aboutHtml?: string;
    organisationName?: string;
    createdBy: string;
  },
  conn: Queryable = db,
): Promise<string> {
  const { rows } = await conn.query(
    `INSERT INTO micro_programmes
       (project_id, slug, title, short_description, about_content, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING id`,
    [
      input.projectId,
      input.slug,
      input.title,
      input.shortDescription ?? null,
      JSON.stringify({
        html: sanitizeHtml(input.aboutHtml ?? ""),
        ...(input.organisationName?.trim() ? { organisation: input.organisationName.trim() } : {}),
      }),
      input.createdBy,
    ],
  );
  return (rows[0] as { id: string }).id;
}

/** Update a programme's title, short description and About/context (sanitised). */
export async function updateProgramme(
  id: string,
  input: {
    title: string;
    shortDescription?: string;
    aboutHtml?: string;
    organisationName?: string;
  },
  conn: Queryable = db,
): Promise<void> {
  const res = await conn.query(
    `UPDATE micro_programmes
       SET title = $2, short_description = $3, about_content = $4
     WHERE id = $1`,
    [
      id,
      input.title,
      input.shortDescription ?? null,
      JSON.stringify({
        html: sanitizeHtml(input.aboutHtml ?? ""),
        ...(input.organisationName?.trim() ? { organisation: input.organisationName.trim() } : {}),
      }),
    ],
  );
  if ((res.rowCount ?? 0) === 0) throw new ServiceError("not_found", "Programme not found");
}

/** True once any learner has registered for the programme (membership locked). */
async function hasProgrammeRegistrations(programmeId: string, conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query(`SELECT 1 FROM enrollments WHERE programme_id = $1 LIMIT 1`, [
    programmeId,
  ]);
  return rows.length > 0;
}

/**
 * Set the ordered credential membership of a programme. Validates:
 *  - no duplicate credentials;
 *  - all credentials belong to the same project as the programme;
 *  - membership is locked once registrations exist.
 */
export async function setProgrammeCredentials(
  programmeId: string,
  items: { credentialId: string; position: number; isRequired?: boolean }[],
  conn?: Queryable,
): Promise<void> {
  const run = async (tx: Queryable) => {
    if (await hasProgrammeRegistrations(programmeId, tx)) {
      throw new ServiceError(
        "membership_locked",
        "Programme has registrations; membership is locked",
      );
    }
    const ids = items.map((i) => i.credentialId);
    if (new Set(ids).size !== ids.length) {
      throw new ServiceError("duplicate_credential", "Duplicate credential in programme");
    }
    const progRes = await tx.query(
      `SELECT COALESCE(NULLIF(mp.about_content->>'organisation', ''), p.organisation_name) AS org
       FROM micro_programmes mp JOIN projects p ON p.id = mp.project_id WHERE mp.id = $1`,
      [programmeId],
    );
    const prog = progRes.rows[0] as { org: string } | undefined;
    if (!prog) throw new ServiceError("not_found", "Programme not found");

    if (ids.length > 0) {
      // A programme is built from credentials of the SAME organisation. A
      // credential's organisation is its published/draft revision's
      // source_metadata.organisation, falling back to its project's.
      const check = await tx.query(
        `SELECT mc.id
         FROM micro_credentials mc
         JOIN projects p ON p.id = mc.project_id
         WHERE mc.id = ANY($1::uuid[])
           AND COALESCE(
                 NULLIF((SELECT cv.source_metadata->>'organisation'
                         FROM credential_versions cv
                         WHERE cv.credential_id = mc.id
                         ORDER BY (cv.status = 'published') DESC, (cv.status = 'draft') DESC,
                                  cv.revision_number DESC
                         LIMIT 1), ''),
                 p.organisation_name
               ) = $2`,
        [ids, prog.org],
      );
      if (check.rows.length !== ids.length) {
        throw new ServiceError(
          "organisation_mismatch",
          "All credentials must belong to the programme's organisation",
        );
      }
    }

    await tx.query(`DELETE FROM programme_credentials WHERE programme_id = $1`, [programmeId]);
    for (const item of items) {
      await tx.query(
        `INSERT INTO programme_credentials (programme_id, credential_id, position, is_required)
         VALUES ($1,$2,$3,$4)`,
        [programmeId, item.credentialId, item.position, item.isRequired ?? true],
      );
    }
  };
  return conn ? run(conn) : withTransaction(run);
}

/**
 * Publish a programme. Only publishable credentials (published with a published
 * revision) may be members when the programme is published.
 */
export async function publishProgramme(programmeId: string, conn?: Queryable): Promise<void> {
  const run = async (tx: Queryable) => {
    const members = await tx.query(
      `SELECT pc.credential_id, mc.status,
              (SELECT count(*) FROM credential_versions cv
                WHERE cv.credential_id = mc.id AND cv.status='published') AS pubcount
       FROM programme_credentials pc
       JOIN micro_credentials mc ON mc.id = pc.credential_id
       WHERE pc.programme_id = $1`,
      [programmeId],
    );
    for (const m of members.rows as { status: string; pubcount: string }[]) {
      if (m.status !== "published" || Number(m.pubcount) < 1) {
        throw new ServiceError(
          "unpublishable_member",
          "All member credentials must be published with a published revision",
        );
      }
    }
    await tx.query(
      `UPDATE micro_programmes SET status='published', published_at = now(), hidden_at = NULL
       WHERE id = $1`,
      [programmeId],
    );
  };
  return conn ? run(conn) : withTransaction(run);
}

export async function hideProgramme(programmeId: string, conn: Queryable = db): Promise<void> {
  await conn.query(
    `UPDATE micro_programmes SET status='hidden', hidden_at = now()
     WHERE id = $1 AND status != 'draft'`,
    [programmeId],
  );
}

export async function unhideProgramme(programmeId: string, conn: Queryable = db): Promise<void> {
  await conn.query(
    `UPDATE micro_programmes SET status='published', hidden_at = NULL
     WHERE id = $1 AND status = 'hidden'`,
    [programmeId],
  );
}

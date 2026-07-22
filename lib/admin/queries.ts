import { db, type Queryable } from "@/lib/db/pool";

/** Distinct topics already assigned to any credential version (for the authoring combobox). */
export async function listCredentialTopics(conn: Queryable = db): Promise<string[]> {
  const { rows } = await conn.query(
    `SELECT DISTINCT source_metadata->>'topic' AS topic
     FROM credential_versions
     WHERE source_metadata->>'topic' IS NOT NULL AND source_metadata->>'topic' <> ''
     ORDER BY topic`,
  );
  return (rows as { topic: string }[]).map((r) => r.topic);
}

export async function adminListCredentials(conn: Queryable = db) {
  const { rows } = await conn.query(
    `SELECT mc.id, mc.code, mc.slug, mc.status, p.name AS project_name,
            (SELECT title FROM credential_versions cv
              WHERE cv.credential_id = mc.id
              ORDER BY (cv.status='draft') DESC, cv.revision_number DESC LIMIT 1) AS title
     FROM micro_credentials mc
     JOIN projects p ON p.id = mc.project_id
     ORDER BY mc.created_at DESC`,
  );
  return rows as {
    id: string;
    code: string;
    slug: string;
    status: string;
    project_name: string;
    title: string | null;
  }[];
}

export async function adminGetCredential(id: string, conn: Queryable = db) {
  const cred = await conn.query(
    `SELECT mc.id, mc.code, mc.slug, mc.status, mc.project_id, p.name AS project_name
     FROM micro_credentials mc JOIN projects p ON p.id = mc.project_id WHERE mc.id = $1`,
    [id],
  );
  if (!cred.rows[0]) return null;
  const versions = await conn.query(
    `SELECT id, revision_number, status, title, published_at, source_metadata,
            content_document, grading_document, certification_rule
     FROM credential_versions WHERE credential_id = $1 ORDER BY revision_number DESC`,
    [id],
  );
  return {
    credential: cred.rows[0] as Record<string, unknown>,
    versions: versions.rows as Record<string, unknown>[],
  };
}

export async function adminListProgrammes(conn: Queryable = db) {
  const { rows } = await conn.query(
    `SELECT mp.id, mp.slug, mp.title, mp.status, p.name AS project_name
     FROM micro_programmes mp JOIN projects p ON p.id = mp.project_id
     ORDER BY mp.created_at DESC`,
  );
  return rows as {
    id: string;
    slug: string;
    title: string;
    status: string;
    project_name: string;
  }[];
}

export interface AdminProgrammeDetail {
  id: string;
  title: string;
  slug: string;
  status: string;
  projectId: string;
  projectName: string;
  shortDescription: string | null;
  aboutHtml: string;
  organisationName: string;
  bannerObjectKey: string | null;
  members: {
    credentialId: string;
    code: string;
    title: string | null;
    position: number;
    isRequired: boolean;
    publishable: boolean;
  }[];
  available: { id: string; code: string; title: string | null; publishable: boolean }[];
}

/** Programme detail for the admin membership editor: current members (ordered)
 * + credentials available to add from the SAME project. */
export async function adminGetProgramme(
  id: string,
  conn: Queryable = db,
): Promise<AdminProgrammeDetail | null> {
  const progRes = await conn.query(
    `SELECT mp.id, mp.title, mp.slug, mp.status, mp.project_id, p.name AS project_name,
            mp.short_description, mp.about_content, mp.banner_object_key,
            COALESCE(NULLIF(mp.about_content->>'organisation', ''), p.organisation_name) AS org_effective
     FROM micro_programmes mp JOIN projects p ON p.id = mp.project_id WHERE mp.id = $1`,
    [id],
  );
  const prog = progRes.rows[0] as
    | {
        id: string;
        title: string;
        slug: string;
        status: string;
        project_id: string;
        project_name: string;
        short_description: string | null;
        about_content: { html?: string; organisation?: string } | null;
        banner_object_key: string | null;
        org_effective: string;
      }
    | undefined;
  if (!prog) return null;

  const members = await conn.query(
    `SELECT pc.credential_id, pc.position, pc.is_required, mc.code,
            (SELECT title FROM credential_versions cv WHERE cv.credential_id = mc.id
              ORDER BY (cv.status='draft') DESC, cv.revision_number DESC LIMIT 1) AS title,
            (mc.status='published' AND EXISTS(SELECT 1 FROM credential_versions cv
               WHERE cv.credential_id=mc.id AND cv.status='published')) AS publishable
     FROM programme_credentials pc
     JOIN micro_credentials mc ON mc.id = pc.credential_id
     WHERE pc.programme_id = $1 ORDER BY pc.position`,
    [id],
  );
  const memberIds = (members.rows as { credential_id: string }[]).map((m) => m.credential_id);

  // Credentials available to add: those of the SAME organisation as the
  // programme (a credential's org = its latest revision's source_metadata,
  // falling back to its project), excluding current members.
  const avail = await conn.query(
    `SELECT mc.id, mc.code,
            (SELECT title FROM credential_versions cv WHERE cv.credential_id = mc.id
              ORDER BY (cv.status='draft') DESC, cv.revision_number DESC LIMIT 1) AS title,
            (mc.status='published' AND EXISTS(SELECT 1 FROM credential_versions cv
               WHERE cv.credential_id=mc.id AND cv.status='published')) AS publishable
     FROM micro_credentials mc
     JOIN projects p ON p.id = mc.project_id
     WHERE COALESCE(
             NULLIF((SELECT cv.source_metadata->>'organisation'
                     FROM credential_versions cv WHERE cv.credential_id = mc.id
                     ORDER BY (cv.status='published') DESC, (cv.status='draft') DESC,
                              cv.revision_number DESC LIMIT 1), ''),
             p.organisation_name
           ) = $1
       AND ($2::uuid[] IS NULL OR NOT (mc.id = ANY($2::uuid[])))
     ORDER BY mc.created_at DESC`,
    [prog.org_effective, memberIds.length ? memberIds : null],
  );

  return {
    id: prog.id,
    title: prog.title,
    slug: prog.slug,
    status: prog.status,
    projectId: prog.project_id,
    projectName: prog.project_name,
    shortDescription: prog.short_description,
    aboutHtml: prog.about_content?.html ?? "",
    organisationName: prog.about_content?.organisation ?? "",
    bannerObjectKey: prog.banner_object_key,
    members: (members.rows as Record<string, unknown>[]).map((m) => ({
      credentialId: m.credential_id as string,
      code: m.code as string,
      title: (m.title as string) ?? null,
      position: m.position as number,
      isRequired: m.is_required as boolean,
      publishable: m.publishable as boolean,
    })),
    available: (avail.rows as Record<string, unknown>[]).map((a) => ({
      id: a.id as string,
      code: a.code as string,
      title: (a.title as string) ?? null,
      publishable: a.publishable as boolean,
    })),
  };
}

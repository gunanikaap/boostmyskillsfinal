import { db, type Queryable } from "@/lib/db/pool";

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
    `SELECT id, revision_number, status, title, published_at,
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

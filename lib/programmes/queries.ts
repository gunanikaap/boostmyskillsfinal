import { db, type Queryable } from "@/lib/db/pool";

export interface PublicProgrammeDetail {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  aboutContent: unknown;
  bannerObjectKey: string | null;
  organisationName: string;
  projectName: string;
  credentials: {
    id: string;
    code: string;
    slug: string;
    title: string;
    position: number;
    organisationName: string;
  }[];
}

/** Public programme detail by slug. Null for draft/hidden/missing (no leak). */
export async function getPublishedProgrammeBySlug(
  slug: string,
  conn: Queryable = db,
): Promise<PublicProgrammeDetail | null> {
  const { rows } = await conn.query(
    `SELECT mp.id, mp.slug, mp.title, mp.short_description, mp.about_content,
            mp.banner_object_key, p.organisation_name, p.name AS project_name
     FROM micro_programmes mp
     JOIN projects p ON p.id = mp.project_id
     WHERE mp.status = 'published' AND mp.slug = $1`,
    [slug],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;

  // Only list published member credentials (published + a published revision).
  const memRes = await conn.query(
    `SELECT mc.id, mc.code, mc.slug, pc.position, cv.title, mp2.organisation_name
     FROM programme_credentials pc
     JOIN micro_credentials mc ON mc.id = pc.credential_id
     JOIN projects mp2 ON mp2.id = mc.project_id
     JOIN credential_versions cv ON cv.credential_id = mc.id AND cv.status='published'
     WHERE pc.programme_id = $1 AND mc.status = 'published'
     ORDER BY pc.position`,
    [r.id],
  );
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    shortDescription: (r.short_description as string) ?? null,
    aboutContent: r.about_content,
    bannerObjectKey: (r.banner_object_key as string) ?? null,
    organisationName: r.organisation_name as string,
    projectName: r.project_name as string,
    credentials: (memRes.rows as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      code: m.code as string,
      slug: m.slug as string,
      title: m.title as string,
      position: m.position as number,
      organisationName: m.organisation_name as string,
    })),
  };
}

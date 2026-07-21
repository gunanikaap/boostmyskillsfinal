import { db, type Queryable } from "@/lib/db/pool";
import type { ContentDocument } from "@/lib/content/schema";

/**
 * Public/learner catalogue reads. These only ever return published + visible
 * entities, and NEVER expose grading_document. Draft and hidden entities are
 * absent from every result here (no leak via list, detail, metadata, etc.).
 */

export interface CatalogueCredential {
  id: string;
  code: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  authorName: string;
  bannerObjectKey: string | null;
  organisationName: string;
  projectName: string;
  /** Titles of the published micro-programmes this credential belongs to. */
  programmeTitles: string[];
  /** Topic taxonomy label, stored in credential_versions.source_metadata. */
  topic: string | null;
}

export async function listPublishedCredentials(
  conn: Queryable = db,
): Promise<CatalogueCredential[]> {
  const { rows } = await conn.query(
    `SELECT mc.id, mc.code, mc.slug,
            cv.title, cv.short_description, cv.author_name, cv.banner_object_key,
            cv.source_metadata->>'topic' AS topic,
            p.organisation_name, p.name AS project_name,
            COALESCE(
              (SELECT array_agg(DISTINCT mp.title)
               FROM programme_credentials pc
               JOIN micro_programmes mp
                 ON mp.id = pc.programme_id AND mp.status = 'published'
               WHERE pc.credential_id = mc.id),
              ARRAY[]::text[]
            ) AS programme_titles
     FROM micro_credentials mc
     JOIN projects p ON p.id = mc.project_id
     JOIN credential_versions cv
       ON cv.credential_id = mc.id AND cv.status = 'published'
     WHERE mc.status = 'published'
     ORDER BY cv.title`,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    slug: r.slug as string,
    title: r.title as string,
    shortDescription: (r.short_description as string) ?? null,
    authorName: r.author_name as string,
    bannerObjectKey: (r.banner_object_key as string) ?? null,
    organisationName: r.organisation_name as string,
    projectName: r.project_name as string,
    programmeTitles: (r.programme_titles as string[]) ?? [],
    topic: (r.topic as string) ?? null,
  }));
}

export interface PublicCredentialDetail extends CatalogueCredential {
  aboutContent: unknown;
  content: ContentDocument; // learner-safe: has no correct answers by schema
  credentialVersionId: string;
}

/** Public detail by slug. Returns null for draft/hidden/missing (no leak). */
export async function getPublishedCredentialBySlug(
  slug: string,
  conn: Queryable = db,
): Promise<PublicCredentialDetail | null> {
  const { rows } = await conn.query(
    `SELECT mc.id, mc.code, mc.slug,
            cv.id AS version_id, cv.title, cv.short_description, cv.author_name,
            cv.banner_object_key, cv.about_content, cv.content_document,
            cv.source_metadata->>'topic' AS topic,
            p.organisation_name, p.name AS project_name,
            COALESCE(
              (SELECT array_agg(DISTINCT mp.title)
               FROM programme_credentials pc
               JOIN micro_programmes mp
                 ON mp.id = pc.programme_id AND mp.status = 'published'
               WHERE pc.credential_id = mc.id),
              ARRAY[]::text[]
            ) AS programme_titles
     FROM micro_credentials mc
     JOIN projects p ON p.id = mc.project_id
     JOIN credential_versions cv
       ON cv.credential_id = mc.id AND cv.status = 'published'
     WHERE mc.status = 'published' AND mc.slug = $1`,
    [slug],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    code: r.code as string,
    slug: r.slug as string,
    title: r.title as string,
    shortDescription: (r.short_description as string) ?? null,
    authorName: r.author_name as string,
    bannerObjectKey: (r.banner_object_key as string) ?? null,
    organisationName: r.organisation_name as string,
    projectName: r.project_name as string,
    programmeTitles: (r.programme_titles as string[]) ?? [],
    topic: (r.topic as string) ?? null,
    aboutContent: r.about_content,
    content: r.content_document as ContentDocument,
    credentialVersionId: r.version_id as string,
  };
}

/** Resolve the currently published revision id for a credential (or null). */
export async function currentPublishedVersionId(
  credentialId: string,
  conn: Queryable = db,
): Promise<string | null> {
  const { rows } = await conn.query(
    `SELECT id FROM credential_versions WHERE credential_id = $1 AND status = 'published'`,
    [credentialId],
  );
  return rows[0] ? (rows[0] as { id: string }).id : null;
}

export interface CatalogueProgramme {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  bannerObjectKey: string | null;
  organisationName: string;
}

export interface CatalogueProgrammeWithMembers extends CatalogueProgramme {
  memberTitles: string[];
}

/** Published programmes plus their published member-credential titles, in order. */
export async function listPublishedProgrammesWithMembers(
  conn: Queryable = db,
): Promise<CatalogueProgrammeWithMembers[]> {
  const { rows } = await conn.query(
    `SELECT mp.id, mp.slug, mp.title, mp.short_description, mp.banner_object_key,
            p.organisation_name,
            COALESCE(
              (SELECT array_agg(cv.title ORDER BY pc.position)
               FROM programme_credentials pc
               JOIN micro_credentials mc ON mc.id = pc.credential_id AND mc.status = 'published'
               JOIN credential_versions cv ON cv.credential_id = mc.id AND cv.status = 'published'
               WHERE pc.programme_id = mp.id),
              ARRAY[]::text[]
            ) AS member_titles
     FROM micro_programmes mp
     JOIN projects p ON p.id = mp.project_id
     WHERE mp.status = 'published'
     ORDER BY mp.created_at, mp.title`,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    shortDescription: (r.short_description as string) ?? null,
    bannerObjectKey: (r.banner_object_key as string) ?? null,
    organisationName: r.organisation_name as string,
    memberTitles: (r.member_titles as string[]) ?? [],
  }));
}

export async function listPublishedProgrammes(conn: Queryable = db): Promise<CatalogueProgramme[]> {
  const { rows } = await conn.query(
    `SELECT mp.id, mp.slug, mp.title, mp.short_description, mp.banner_object_key,
            p.organisation_name
     FROM micro_programmes mp
     JOIN projects p ON p.id = mp.project_id
     WHERE mp.status = 'published'
     ORDER BY mp.title`,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    shortDescription: (r.short_description as string) ?? null,
    bannerObjectKey: (r.banner_object_key as string) ?? null,
    organisationName: r.organisation_name as string,
  }));
}

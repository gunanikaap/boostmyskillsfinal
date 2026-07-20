import { db, type Queryable } from "@/lib/db/pool";

/**
 * Media authorization policy. Routes NEVER serve an arbitrary key from the
 * filesystem: a banner key is only public when it belongs to a PUBLISHED +
 * visible credential (with a published revision) or a published programme.
 * OLX archives and any other key are never public.
 */
export async function isPublicBanner(objectKey: string, conn: Queryable = db): Promise<boolean> {
  const { rows } = await conn.query(
    `SELECT 1
       FROM credential_versions cv
       JOIN micro_credentials mc ON mc.id = cv.credential_id
      WHERE cv.banner_object_key = $1
        AND cv.status = 'published'
        AND mc.status = 'published'
      UNION
     SELECT 1
       FROM micro_programmes mp
      WHERE mp.banner_object_key = $1
        AND mp.status = 'published'
      LIMIT 1`,
    [objectKey],
  );
  return rows.length > 0;
}

/** True if the key is a banner_object_key of ANY credential revision or programme
 * (used so /media can serve draft/hidden banners to admins but never OLX archives). */
export async function bannerKeyExists(objectKey: string, conn: Queryable = db): Promise<boolean> {
  const { rows } = await conn.query(
    `SELECT 1 FROM credential_versions WHERE banner_object_key = $1
     UNION SELECT 1 FROM micro_programmes WHERE banner_object_key = $1 LIMIT 1`,
    [objectKey],
  );
  return rows.length > 0;
}

/** Look up the private OLX archive key for a credential's draft/published revision. */
export async function olxArchiveKeyForCredential(
  credentialId: string,
  conn: Queryable = db,
): Promise<string | null> {
  const { rows } = await conn.query(
    `SELECT source_metadata->>'archiveObjectKey' AS k
       FROM credential_versions
      WHERE credential_id = $1 AND source_metadata->>'archiveObjectKey' IS NOT NULL
      ORDER BY (status='draft') DESC, revision_number DESC
      LIMIT 1`,
    [credentialId],
  );
  const k = (rows[0] as { k: string | null } | undefined)?.k ?? null;
  return k;
}

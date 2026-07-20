import { db, type Queryable } from "@/lib/db/pool";
import { getStorage } from "@/lib/storage/factory";
import { credentialBannerKey, programmeBannerKey } from "@/lib/storage/keys";
import { validateBanner } from "@/lib/storage/validateUpload";
import { ServiceError } from "@/lib/credentials/service";

/**
 * Store a credential banner on the current DRAFT revision. Validates the image
 * bytes (MIME/signature/size), writes via the storage provider under a
 * server-generated key, and persists ONLY the logical key.
 */
export async function uploadCredentialBanner(
  credentialId: string,
  bytes: Buffer,
  conn: Queryable = db,
): Promise<{ objectKey: string }> {
  const meta = validateBanner(bytes); // throws StorageError on bad type/size
  const { rows } = await conn.query(
    `SELECT id FROM credential_versions WHERE credential_id = $1 AND status = 'draft'`,
    [credentialId],
  );
  const draft = rows[0] as { id: string } | undefined;
  if (!draft)
    throw new ServiceError("no_draft", "No editable draft revision to attach a banner to");

  const objectKey = credentialBannerKey(credentialId, "banner");
  await getStorage().putObject(objectKey, bytes, { contentType: meta.contentType });
  await conn.query(`UPDATE credential_versions SET banner_object_key = $2 WHERE id = $1`, [
    draft.id,
    objectKey,
  ]);
  return { objectKey };
}

export async function uploadProgrammeBanner(
  programmeId: string,
  bytes: Buffer,
  conn: Queryable = db,
): Promise<{ objectKey: string }> {
  const meta = validateBanner(bytes);
  const objectKey = programmeBannerKey(programmeId, "banner");
  await getStorage().putObject(objectKey, bytes, { contentType: meta.contentType });
  await conn.query(`UPDATE micro_programmes SET banner_object_key = $2 WHERE id = $1`, [
    programmeId,
    objectKey,
  ]);
  return { objectKey };
}

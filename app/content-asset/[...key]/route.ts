import { NextResponse } from "next/server";
import { db } from "@/lib/db/pool";
import { getStorage } from "@/lib/storage/factory";
import { StorageError } from "@/lib/storage/types";
import { assertValidKey } from "@/lib/storage/keys";
import { requireAuthenticatedUser, requirePublishedCredentialAccess } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { contentReferencesAssetKey } from "@/lib/content/assets";

/**
 * Serves imported private content assets (currently OLX PDF readings) stored
 * under a `content/<credentialId>/<revisionId>/<uuid>.<ext>` key.
 *
 * Authorisation binds the request to a SPECIFIC credential revision, not merely
 * the credential:
 *  - the key must name a revision that belongs to the stated credential AND that
 *    revision's content_document must reference the exact key (no prefix trust);
 *  - a learner must be signed in + active, the credential must be published, they
 *    must be enrolled, and their enrolment's assigned revision must be exactly the
 *    key's revision;
 *  - an active admin may preview a referenced asset of any of the credential's
 *    revisions (incl. draft/hidden), but not an unreferenced key.
 * The credential id + revision id come only from the key path, never the caller.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseKey(key: string): { credentialId: string; revisionId: string } | null {
  const segs = key.split("/");
  const i = segs.indexOf("content");
  if (i < 0) return null;
  const credentialId = segs[i + 1];
  const revisionId = segs[i + 2];
  if (!credentialId || !revisionId || !UUID.test(credentialId) || !UUID.test(revisionId)) {
    return null;
  }
  return { credentialId, revisionId };
}

function deny(status = 404): NextResponse {
  return NextResponse.json({ error: "not found" }, { status });
}

async function serve(key: string): Promise<NextResponse> {
  try {
    const bytes = await getStorage().getObject(key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") return deny();
    return deny();
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
): Promise<NextResponse> {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  try {
    assertValidKey(key);
  } catch {
    return deny();
  }
  const parsed = parseKey(key);
  if (!parsed) return deny();
  const { credentialId, revisionId } = parsed;

  // Active authenticated user required (anonymous / deactivated → 401).
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (err) {
    return deny(err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 404);
  }

  // The named revision must belong to the stated credential AND reference the key.
  const revRes = await db.query(
    `SELECT content_document FROM credential_versions WHERE id = $1 AND credential_id = $2`,
    [revisionId, credentialId],
  );
  const rev = revRes.rows[0] as { content_document: unknown } | undefined;
  if (!rev || !contentReferencesAssetKey(rev.content_document, key)) return deny();

  if (user.role === "admin") {
    // Active admin may preview a REFERENCED asset of this credential's revision.
    return serve(key);
  }

  // Learner: credential published (hidden/draft → 404), enrolled, and the
  // enrolment's assigned revision is exactly this revision.
  try {
    await requirePublishedCredentialAccess(credentialId);
  } catch {
    return deny();
  }
  const enrRes = await db.query(
    `SELECT credential_version_id FROM enrollments WHERE user_id = $1 AND credential_id = $2`,
    [user.id, credentialId],
  );
  const enr = enrRes.rows[0] as { credential_version_id: string | null } | undefined;
  if (!enr || enr.credential_version_id !== revisionId) return deny();

  return serve(key);
}

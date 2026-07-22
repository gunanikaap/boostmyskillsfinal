import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage/factory";
import { StorageError } from "@/lib/storage/types";
import { assertValidKey } from "@/lib/storage/keys";
import { requireCredentialContentAccess, requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";

/**
 * Serves imported content assets (currently OLX PDF readings) stored under a
 * `content/<credentialId>/<revisionId>/<uuid>.<ext>` key. Authorisation mirrors
 * the player: a learner may fetch it only if the credential is published AND
 * they're enrolled; an admin may fetch it for any credential (draft preview).
 * The credential id is taken from the key path, never from the caller.
 */
function credentialIdFromKey(key: string): string | null {
  const segs = key.split("/");
  const i = segs.indexOf("content");
  return i >= 0 && segs[i + 1] ? segs[i + 1]! : null;
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
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const credentialId = credentialIdFromKey(key);
  if (!credentialId) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await requireCredentialContentAccess(credentialId); // published + enrolled
  } catch {
    try {
      await requireAdmin(); // admins can preview any credential's assets
    } catch (err) {
      const status = err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 404;
      return NextResponse.json({ error: "not found" }, { status });
    }
  }

  try {
    const bytes = await getStorage().getObject(key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

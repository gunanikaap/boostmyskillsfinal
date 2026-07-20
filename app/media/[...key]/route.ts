import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage/factory";
import { StorageError } from "@/lib/storage/types";
import { assertValidKey } from "@/lib/storage/keys";
import { isPublicBanner, bannerKeyExists } from "@/lib/storage/mediaAccess";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";

const CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Controlled media route. It NEVER serves an arbitrary filesystem path: it only
 * serves keys that are banner_object_key values. Published banners are public;
 * draft/hidden banners are visible only to admins. OLX archives (and any other
 * key) are never served here.
 */
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

  const publicOk = await isPublicBanner(key);
  if (!publicOk) {
    // Not a published banner → only an admin may view (draft/hidden preview),
    // and only if the key is actually a banner (never an OLX archive).
    try {
      await requireAdmin();
    } catch (err) {
      const status = err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 404;
      return NextResponse.json({ error: "not found" }, { status });
    }
    if (!(await bannerKeyExists(key))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  try {
    const bytes = await getStorage().getObject(key);
    const ext = (key.split(".").pop() ?? "").toLowerCase();
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[ext] ?? "application/octet-stream",
        "Cache-Control": publicOk ? "public, max-age=3600" : "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

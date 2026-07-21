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

/** Determine the image content type from the bytes (server-generated keys carry no ext). */
function sniffContentType(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

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
    // Prefer the actual bytes (server keys carry no extension); fall back to ext.
    const contentType = sniffContentType(bytes) ?? CONTENT_TYPE[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
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

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { getStorage } from "@/lib/storage/factory";
import { olxArchiveKeyForCredential } from "@/lib/storage/mediaAccess";

/**
 * Admin-only download of a credential's stored original OLX archive. The private
 * key is resolved server-side from source_metadata — never supplied by the URL.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    const status = err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: "not authorised" }, { status });
  }
  const { id } = await ctx.params;
  const key = await olxArchiveKeyForCredential(id);
  if (!key) return NextResponse.json({ error: "no archive" }, { status: 404 });

  try {
    const bytes = await getStorage().getObject(key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${id}-source.tar.gz"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

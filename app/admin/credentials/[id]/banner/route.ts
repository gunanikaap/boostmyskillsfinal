import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { StorageError } from "@/lib/storage/types";
import { ServiceError } from "@/lib/credentials/service";
import { uploadCredentialBanner } from "@/lib/storage/bannerService";

/** Admin-only credential banner upload (multipart `file`). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    const status = err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: "not authorised" }, { status });
  }
  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const { objectKey } = await uploadCredentialBanner(id, bytes);
    return NextResponse.json({ ok: true, objectKey });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.code }, { status: 422 });
    }
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}

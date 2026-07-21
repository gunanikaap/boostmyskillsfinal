import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { StorageError } from "@/lib/storage/types";
import { uploadProgrammeBanner } from "@/lib/storage/bannerService";

/** Admin-only programme banner upload (multipart `file`). Learner/anon denied. */
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
    const { objectKey } = await uploadProgrammeBanner(id, bytes);
    return NextResponse.json({ ok: true, objectKey });
  } catch (err) {
    if (err instanceof StorageError) {
      // Validation/type/size failure — the previous banner (if any) is untouched
      // because the DB update only happens after a successful storage write.
      return NextResponse.json({ error: err.code }, { status: 422 });
    }
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}

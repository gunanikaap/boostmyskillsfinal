import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { OlxArchiveError } from "@/lib/olx/errors";
import { importOlxToDraft } from "@/lib/olx/importer";

/**
 * Admin-only OLX import endpoint (multipart: `file` + `projectId`). Runs archive
 * safety, parses, and creates a DRAFT credential — never publishes. Returns the
 * new credential id or a safe error.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    const status = err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: "not authorised" }, { status });
  }

  const form = await req.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "");
  if (!(file instanceof File) || !projectId) {
    return NextResponse.json({ error: "file and projectId are required" }, { status: 400 });
  }
  const gz = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importOlxToDraft({
      gz,
      originalFilename: file.name,
      projectId,
      adminId: admin.id,
    });
    return NextResponse.json({
      ok: true,
      credentialId: result.credentialId,
      source: result.source,
      unsupportedBlocks: result.unsupportedBlocks,
    });
  } catch (err) {
    if (err instanceof OlxArchiveError) {
      // Safe, specific rejection reason (no internal paths).
      return NextResponse.json({ error: `archive rejected: ${err.code}` }, { status: 422 });
    }
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}

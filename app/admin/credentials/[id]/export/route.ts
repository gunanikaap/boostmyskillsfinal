import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { db } from "@/lib/db/pool";
import { exportCredentialToOlx } from "@/lib/olx/exporter";
import { contentDocumentSchema, gradingDocumentSchema } from "@/lib/content/schema";

/**
 * Admin-only OLX export of a credential's current draft (preferred) or published
 * revision. Authorization is enforced server-side here.
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
  const { rows } = await db.query(
    `SELECT cv.title, cv.author_name, cv.content_document, cv.grading_document,
            cv.certification_rule, mc.code, mc.slug
     FROM credential_versions cv
     JOIN micro_credentials mc ON mc.id = cv.credential_id
     WHERE cv.credential_id = $1
     ORDER BY (cv.status='draft') DESC, (cv.status='published') DESC, cv.revision_number DESC
     LIMIT 1`,
    [id],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

  const content = contentDocumentSchema.parse(r.content_document);
  const grading = gradingDocumentSchema.parse(r.grading_document);
  const gz = exportCredentialToOlx(content, grading, {
    code: r.code as string,
    slug: r.slug as string,
    title: r.title as string,
    authorName: r.author_name as string,
    certificationRule: r.certification_rule,
  });

  return new NextResponse(Buffer.from(gz), {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${r.slug}.tar.gz"`,
    },
  });
}

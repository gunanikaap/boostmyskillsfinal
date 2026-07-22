import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { db } from "@/lib/db/pool";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { siteUrl } from "@/lib/env";

/**
 * Owner-only certificate PDF download. The certificate must belong to the
 * authenticated user (ownership checked in SQL — never trusted from the URL).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await ctx.params;
  const user = await getCurrentAppUser();
  // Unauthenticated OR deactivated → deny without revealing the deletion state.
  if (!user || user.deactivated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { rows } = await db.query(
    `SELECT c.certificate_snapshot, c.status
     FROM certificates c
     JOIN enrollments e ON e.id = c.enrollment_id
     WHERE c.verification_code = $1 AND e.user_id = $2`,
    [code, user.id],
  );
  const row = rows[0] as
    { certificate_snapshot: Record<string, unknown>; status: string } | undefined;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "issued")
    return NextResponse.json({ error: "certificate revoked" }, { status: 410 });

  const s = row.certificate_snapshot;
  const pdf = await renderCertificatePdf({
    learnerName: (s.learnerName as string) ?? "",
    credentialTitle: (s.credentialTitle as string) ?? "",
    credentialCode: (s.credentialCode as string) ?? "",
    organisationName: (s.organisationName as string) ?? "",
    issuerName: (s.issuerName as string) ?? "",
    issueDate: (s.issueDate as string) ?? new Date().toISOString(),
    verificationCode: code,
    siteUrl: siteUrl(),
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificate-${code}.pdf"`,
      // Owner-only document — never cached by shared/proxy caches.
      "Cache-Control": "private, no-store",
    },
  });
}

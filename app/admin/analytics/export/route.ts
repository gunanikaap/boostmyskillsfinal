import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { adminEnrolmentAnalytics, analyticsToCsv } from "@/lib/admin/analytics";

/** Admin-only CSV export. Authorization is enforced here, not just in the UI. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    const status = err instanceof AccessError && err.kind === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: "not authorised" }, { status });
  }
  const p = req.nextUrl.searchParams;
  const rows = await adminEnrolmentAnalytics({
    userId: p.get("userId") ?? undefined,
    organisationName: p.get("organisation") ?? undefined,
    projectName: p.get("project") ?? undefined,
    programmeId: p.get("programmeId") ?? undefined,
    credentialId: p.get("credentialId") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
  });
  const csv = analyticsToCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enrolment-analytics.csv"`,
      // Learner PII — never cached by shared/proxy caches.
      "Cache-Control": "private, no-store",
    },
  });
}

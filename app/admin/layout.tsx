import Link from "next/link";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import StaticPage from "@/components/StaticPage";
import AdminBar from "@/components/admin/AdminBar";

export const dynamic = "force-dynamic";

/**
 * Server-side admin authorization boundary for the whole /admin area. This is
 * the authoritative gate (the edge middleware is only a first line of defence).
 * Every admin server action ALSO calls requireAdmin() independently — the layout
 * gate is not the sole enforcement point.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch (err) {
    const kind = err instanceof AccessError ? err.kind : "forbidden";
    return (
      <StaticPage title="Admin">
        <p>
          {kind === "unauthenticated"
            ? "Admin access requires signing in with an administrator account."
            : "You do not have administrator access."}
        </p>
        <p style={{ color: "var(--bms-muted)" }}>
          <Link href="/">Return home</Link>
        </p>
      </StaticPage>
    );
  }

  return (
    <div className="admin-shell">
      <AdminBar />
      <main className="container admin-page">{children}</main>
    </div>
  );
}

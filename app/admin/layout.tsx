import Link from "next/link";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import StaticPage from "@/components/StaticPage";

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
    <div>
      <header style={{ background: "var(--bms-green-dark)", color: "#fff" }}>
        <div
          className="container"
          style={{ display: "flex", gap: 18, padding: "12px 20px", alignItems: "center" }}
        >
          <Link href="/admin" style={{ color: "#fff", fontWeight: 800, textDecoration: "none" }}>
            BMS Admin
          </Link>
          <nav style={{ display: "flex", gap: 16, marginLeft: "auto" }}>
            <Link href="/admin/projects" style={{ color: "#fff" }}>
              Projects
            </Link>
            <Link href="/admin/credentials" style={{ color: "#fff" }}>
              Credentials
            </Link>
            <Link href="/admin/programmes" style={{ color: "#fff" }}>
              Programmes
            </Link>
            <Link href="/admin/imports" style={{ color: "#fff" }}>
              Imports
            </Link>
            <Link href="/admin/contact" style={{ color: "#fff" }}>
              Contact messages
            </Link>
            <Link href="/admin/account-deletions" style={{ color: "#fff" }}>
              Account deletions
            </Link>
            <Link href="/admin/analytics" style={{ color: "#fff" }}>
              Analytics
            </Link>
            <Link href="/admin/maintenance" style={{ color: "#fff" }}>
              Maintenance
            </Link>
          </nav>
        </div>
      </header>
      <div className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
        {children}
      </div>
    </div>
  );
}

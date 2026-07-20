import Link from "next/link";
import { db } from "@/lib/db/pool";
import { getMaintenance } from "@/lib/settings/maintenance";

export const dynamic = "force-dynamic";

async function counts() {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*) FROM projects)::int AS projects,
       (SELECT count(*) FROM micro_credentials)::int AS credentials,
       (SELECT count(*) FROM micro_credentials WHERE status='published')::int AS published,
       (SELECT count(*) FROM micro_programmes)::int AS programmes,
       (SELECT count(*) FROM enrollments)::int AS enrolments`,
  );
  return rows[0] as Record<string, number>;
}

export default async function AdminDashboard() {
  const c = await counts();
  const m = await getMaintenance();
  return (
    <div>
      <h1>Admin dashboard</h1>
      {m.maintenanceMode && (
        <div className="card" style={{ borderColor: "#c47", marginBottom: 16 }}>
          Maintenance mode is <strong>ON</strong>. Non-admin access is restricted.
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
        }}
      >
        <Stat label="Projects" value={c.projects ?? 0} href="/admin/projects" />
        <Stat label="Credentials" value={c.credentials ?? 0} href="/admin/credentials" />
        <Stat label="Published" value={c.published ?? 0} href="/admin/credentials" />
        <Stat label="Programmes" value={c.programmes ?? 0} href="/admin/programmes" />
        <Stat label="Enrolments" value={c.enrolments ?? 0} href="/admin/analytics" />
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ fontSize: 32, fontWeight: 800 }}>{value}</div>
      <div style={{ color: "var(--bms-muted)" }}>{label}</div>
    </Link>
  );
}

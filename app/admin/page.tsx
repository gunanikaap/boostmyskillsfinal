import Link from "next/link";
import { db } from "@/lib/db/pool";
import { getMaintenance } from "@/lib/settings/maintenance";
import { listDeletionRequests } from "@/lib/account/deletion";

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
  const pendingDeletions = (await listDeletionRequests()).filter(
    (r) => r.status === "pending",
  ).length;

  return (
    <div>
      <div className="admin-head">
        <p className="crumb">
          <Link href="/">Home</Link> / Admin
        </p>
        <h1>Admin dashboard</h1>
        <p className="admin-head__sub">
          Manage the catalogue, learners and platform settings for BoostMySkills.
        </p>
      </div>

      {m.maintenanceMode && (
        <div className="admin-alert" role="status">
          <strong>Maintenance mode is ON.</strong> Non-admin access is restricted.{" "}
          <Link href="/admin/maintenance">Manage</Link>
        </div>
      )}
      {pendingDeletions > 0 && (
        <div className="admin-alert admin-alert--info" role="status">
          <strong>
            {pendingDeletions} account deletion request{pendingDeletions === 1 ? "" : "s"}
          </strong>{" "}
          awaiting your review. <Link href="/admin/account-deletions">Review</Link>
        </div>
      )}

      <div className="admin-stats">
        <Stat label="Projects" value={c.projects ?? 0} href="/admin/projects" />
        <Stat label="Credentials" value={c.credentials ?? 0} href="/admin/credentials" />
        <Stat label="Published" value={c.published ?? 0} href="/admin/credentials" />
        <Stat label="Programmes" value={c.programmes ?? 0} href="/admin/programmes" />
        <Stat label="Enrolments" value={c.enrolments ?? 0} href="/admin/analytics" />
      </div>

      <section className="admin-section">
        <h2>Quick actions</h2>
        <div className="admin-quick">
          <Action
            href="/admin/credentials"
            title="Micro-credentials"
            body="Author, publish, hide and edit credential content."
          />
          <Action
            href="/admin/programmes"
            title="Micro-programmes"
            body="Bundle credentials into guided learning paths."
          />
          <Action
            href="/admin/projects"
            title="Projects"
            body="Manage funded projects and certificate issuers."
          />
          <Action
            href="/admin/imports"
            title="OLX import"
            body="Import Open edX course archives into drafts."
          />
          <Action
            href="/admin/analytics"
            title="Analytics"
            body="Enrolment and completion figures, with CSV export."
          />
          <Action
            href="/admin/account-deletions"
            title="Account deletions"
            body="Review and approve learner deletion requests."
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="admin-stat">
      <span className="admin-stat__num">{value}</span>
      <span className="admin-stat__label">{label}</span>
    </Link>
  );
}

function Action({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="admin-quick__card">
      <h3>{title}</h3>
      <p>{body}</p>
      <span className="admin-quick__go" aria-hidden="true">
        Open →
      </span>
    </Link>
  );
}

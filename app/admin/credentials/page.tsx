import Link from "next/link";
import { adminListCredentials, listCredentialTopics } from "@/lib/admin/queries";
import { listProjects } from "@/lib/credentials/service";
import { CredentialForm } from "./CredentialForm";

export const dynamic = "force-dynamic";

export default async function AdminCredentialsPage() {
  const [credentials, projects, topics] = await Promise.all([
    adminListCredentials(),
    listProjects() as Promise<{ id: string; name: string }[]>,
    listCredentialTopics(),
  ]);
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <h1>Micro-credentials</h1>
      <CredentialForm projects={projects} topics={topics} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--bms-border)" }}>
            <th style={{ padding: 8 }}>Code</th>
            <th style={{ padding: 8 }}>Title</th>
            <th style={{ padding: 8 }}>Project</th>
            <th style={{ padding: 8 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid var(--bms-border)" }}>
              <td style={{ padding: 8 }}>
                <Link href={`/admin/credentials/${c.id}`}>{c.code}</Link>
              </td>
              <td style={{ padding: 8 }}>{c.title ?? "—"}</td>
              <td style={{ padding: 8 }}>{c.project_name}</td>
              <td style={{ padding: 8 }}>
                <StatusBadge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "published" ? "#1f7a53" : status === "hidden" ? "#a15" : "#777";
  return <span style={{ color, fontWeight: 700 }}>{status}</span>;
}

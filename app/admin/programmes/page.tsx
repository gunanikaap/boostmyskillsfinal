import { adminListProgrammes } from "@/lib/admin/queries";
import { listProjects } from "@/lib/credentials/service";
import { ProgrammeForm, ProgrammeRowActions } from "./ProgrammeControls";

export const dynamic = "force-dynamic";

export default async function AdminProgrammesPage() {
  const [programmes, projects] = await Promise.all([
    adminListProgrammes(),
    listProjects() as Promise<{ id: string; name: string }[]>,
  ]);
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <h1>Micro-programmes</h1>
      <ProgrammeForm projects={projects} />
      <p style={{ color: "var(--bms-muted)", fontSize: 13, margin: 0 }}>
        Credential membership is managed through the tested programme service; publish requires all
        member credentials to be published.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--bms-border)" }}>
            <th style={{ padding: 8 }}>Title</th>
            <th style={{ padding: 8 }}>Project</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {programmes.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid var(--bms-border)" }}>
              <td style={{ padding: 8 }}>{p.title}</td>
              <td style={{ padding: 8 }}>{p.project_name}</td>
              <td style={{ padding: 8 }}>{p.status}</td>
              <td style={{ padding: 8 }}>
                <ProgrammeRowActions id={p.id} status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

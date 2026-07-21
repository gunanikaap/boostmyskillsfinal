import { listProjects } from "@/lib/credentials/service";
import { ProjectForm } from "./ProjectForm";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const projects = (await listProjects()) as {
    id: string;
    name: string;
    slug: string;
    organisation_name: string;
  }[];
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <h1>Projects</h1>
      <ProjectForm />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--bms-border)" }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Slug</th>
            <th style={{ padding: 8 }}>Organisation</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid var(--bms-border)" }}>
              <td style={{ padding: 8 }}>
                <a href={`/admin/projects/${p.id}`}>{p.name}</a>
              </td>
              <td style={{ padding: 8 }}>{p.slug}</td>
              <td style={{ padding: 8 }}>{p.organisation_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

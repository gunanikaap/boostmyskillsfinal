import { listProjects } from "@/lib/credentials/service";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function AdminImportsPage() {
  const projects = (await listProjects()) as { id: string; name: string }[];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>OLX import</h1>
      <p style={{ color: "var(--bms-muted)", margin: 0 }}>
        Uploads are validated for archive safety (traversal, symlink/hardlink, device files, size
        bombs) and imported as a <strong>draft</strong> for review. Nothing is published
        automatically.
      </p>
      <ImportForm projects={projects} />
    </div>
  );
}

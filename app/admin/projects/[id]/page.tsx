import { notFound } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/credentials/service";
import { ProjectEditForm } from "./ProjectEditForm";

export const dynamic = "force-dynamic";

export default async function AdminProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <p style={{ color: "var(--bms-muted)", margin: 0 }}>
          <Link href="/admin/projects">all projects</Link>
        </p>
        <h1 style={{ margin: "4px 0" }}>{project.name}</h1>
      </div>
      <ProjectEditForm project={project} />
    </div>
  );
}

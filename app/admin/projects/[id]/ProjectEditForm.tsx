"use client";

import { useState, useTransition } from "react";
import { updateProjectAction } from "@/app/admin/actions";
import type { ProjectDetail } from "@/lib/credentials/service";

export function ProjectEditForm({ project }: { project: ProjectDetail }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const t = (project.certificateTemplate ?? {}) as {
    issuerName?: string;
    signatoryName?: string;
    signatoryRole?: string;
  };
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 10, maxWidth: 480 }}
      action={(fd) =>
        start(async () => setMsg((await updateProjectAction(project.id, fd)).message))
      }
    >
      <h3 style={{ margin: 0 }}>Edit project</h3>
      <label>
        Name
        <input name="name" defaultValue={project.name} required />
      </label>
      <label>
        Slug (immutable)
        <input value={project.slug} readOnly disabled />
      </label>
      <label>
        Organisation name
        <input name="organisationName" defaultValue={project.organisationName} required />
      </label>
      <fieldset style={{ border: "1px solid var(--bms-border)", borderRadius: 8 }}>
        <legend>Certificate template</legend>
        <label>
          Issuer name
          <input name="issuerName" defaultValue={t.issuerName ?? ""} required />
        </label>
        <label>
          Signatory name
          <input name="signatoryName" defaultValue={t.signatoryName ?? ""} />
        </label>
        <label>
          Signatory role
          <input name="signatoryRole" defaultValue={t.signatoryRole ?? ""} />
        </label>
      </fieldset>
      <button className="btn" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save project"}
      </button>
      {msg && (
        <p role="status" style={{ color: "var(--bms-muted)" }}>
          {msg}
        </p>
      )}
    </form>
  );
}

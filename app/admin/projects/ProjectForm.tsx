"use client";

import { useState, useTransition } from "react";
import { createProjectAction } from "@/app/admin/actions";

export function ProjectForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 10, maxWidth: 420 }}
      action={(fd) =>
        start(async () => {
          const res = await createProjectAction(fd);
          setMsg(res.message);
        })
      }
    >
      <h3 style={{ margin: 0 }}>New project</h3>
      <input name="name" placeholder="Project name" required />
      <input name="slug" placeholder="slug" required />
      <input name="organisationName" placeholder="Organisation name" required />
      <input name="issuerName" placeholder="Certificate issuer name (optional)" />
      <input name="signatoryName" placeholder="Certificate signatory name (optional)" />
      <input name="signatoryRole" placeholder="Certificate signatory role (optional)" />
      <button className="btn" disabled={pending} aria-busy={pending}>
        {pending ? "Creating…" : "Create project"}
      </button>
      {msg && <p style={{ color: "var(--bms-muted)" }}>{msg}</p>}
    </form>
  );
}

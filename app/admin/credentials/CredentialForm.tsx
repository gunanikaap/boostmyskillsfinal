"use client";

import { useState, useTransition } from "react";
import { createCredentialAction } from "@/app/admin/actions";

export function CredentialForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [inline, setInline] = useState(projects.length === 0);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 10, maxWidth: 480 }}
      action={(fd) =>
        start(async () => {
          const res = await createCredentialAction(fd);
          setMsg(res.message);
        })
      }
    >
      <h3 style={{ margin: 0 }}>New micro-credential (draft)</h3>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={inline} onChange={(e) => setInline(e.target.checked)} />
        Create a new project inline
      </label>
      {inline ? (
        <>
          <input name="newProjectName" placeholder="New project name" required />
          <input name="newProjectSlug" placeholder="New project slug" required />
          <input name="newProjectOrg" placeholder="Organisation name" required />
        </>
      ) : (
        <select name="projectId" required defaultValue="">
          <option value="" disabled>
            Select project…
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <input name="code" placeholder="Code (e.g. MC36)" required />
      <input name="slug" placeholder="slug" required />
      <input name="title" placeholder="Title" required />
      <input name="authorName" placeholder="Author name" required />
      <input name="shortDescription" placeholder="Short description (optional)" />
      <button className="btn" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>
      {msg && <p style={{ color: "var(--bms-muted)" }}>{msg}</p>}
    </form>
  );
}

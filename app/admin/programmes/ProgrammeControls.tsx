"use client";

import { useState, useTransition } from "react";
import {
  createProgrammeAction,
  publishProgrammeAction,
  toggleProgrammeHiddenAction,
} from "@/app/admin/actions";

export function ProgrammeForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 10, maxWidth: 480 }}
      action={(fd) => start(async () => setMsg((await createProgrammeAction(fd)).message))}
    >
      <h3 style={{ margin: 0 }}>New micro-programme (draft)</h3>
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
      <input name="title" placeholder="Title" required />
      <input name="slug" placeholder="slug" required />
      <input name="shortDescription" placeholder="Short description (optional)" />
      <button className="btn" disabled={pending}>
        {pending ? "Creating…" : "Create programme"}
      </button>
      {msg && <p style={{ color: "var(--bms-muted)" }}>{msg}</p>}
    </form>
  );
}

export function ProgrammeRowActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ message: string }>) =>
    start(async () => setMsg((await fn()).message));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {status !== "published" && (
        <button
          className="btn"
          disabled={pending}
          onClick={() => run(() => publishProgrammeAction(id))}
        >
          Publish
        </button>
      )}
      {status === "hidden" ? (
        <button
          className="btn"
          disabled={pending}
          onClick={() => run(() => toggleProgrammeHiddenAction(id, false))}
        >
          Unhide
        </button>
      ) : (
        status !== "draft" && (
          <button
            className="btn"
            disabled={pending}
            onClick={() => run(() => toggleProgrammeHiddenAction(id, true))}
          >
            Hide
          </button>
        )
      )}
      {msg && <span style={{ color: "var(--bms-muted)", fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

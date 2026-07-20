"use client";

import { useState } from "react";

export function ImportForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card"
      style={{ display: "grid", gap: 10, maxWidth: 480 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/admin/imports/upload", { method: "POST", body: fd });
        const data = await res.json();
        setBusy(false);
        setMsg(
          res.ok ? `Imported draft ${data.credentialId} (source: ${data.source}).` : data.error,
        );
      }}
    >
      <h3 style={{ margin: 0 }}>Import OLX archive (.tar.gz)</h3>
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
      <input type="file" name="file" accept=".tar.gz,.tgz,application/gzip" required />
      <button className="btn" disabled={busy}>
        {busy ? "Importing…" : "Import as draft"}
      </button>
      {msg && <p style={{ color: "var(--bms-muted)" }}>{msg}</p>}
    </form>
  );
}

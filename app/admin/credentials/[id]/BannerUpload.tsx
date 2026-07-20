"use client";

import { useState } from "react";

export function BannerUpload({ credentialId }: { credentialId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 8, maxWidth: 420 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch(`/admin/credentials/${credentialId}/banner`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        setBusy(false);
        setMsg(res.ok ? "Banner uploaded to draft." : `Rejected: ${data.error}`);
      }}
    >
      <h3 style={{ margin: 0 }}>Banner (16:9, WebP/JPEG/PNG, ≤ 2 MB)</h3>
      <input type="file" name="file" accept="image/webp,image/jpeg,image/png" required />
      <button className="btn" disabled={busy}>
        {busy ? "Uploading…" : "Upload banner to draft"}
      </button>
      {msg && <p style={{ color: "var(--bms-muted)" }}>{msg}</p>}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updateProgrammeAction } from "@/app/admin/actions";
import type { AdminProgrammeDetail } from "@/lib/admin/queries";

export function ProgrammeDetailsEditor({ detail }: { detail: AdminProgrammeDetail }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bannerKey, setBannerKey] = useState(detail.bannerObjectKey);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <form
        className="card"
        style={{ display: "grid", gap: 10, maxWidth: 560 }}
        action={(fd) =>
          start(async () => setMsg((await updateProgrammeAction(detail.id, fd)).message))
        }
      >
        <h3 style={{ margin: 0 }}>Programme details</h3>
        <label>
          Title
          <input name="title" defaultValue={detail.title} required />
        </label>
        <label>
          Slug (immutable)
          <input value={detail.slug} readOnly disabled />
        </label>
        <label>
          Organisation (delivering partner)
          <input
            name="organisationName"
            defaultValue={detail.organisationName}
            placeholder="e.g. University of Coimbra"
            required
          />
        </label>
        <label>
          Short description
          <input name="shortDescription" defaultValue={detail.shortDescription ?? ""} />
        </label>
        <label>
          About / context (safe HTML — sanitised server-side)
          <textarea name="aboutHtml" rows={5} defaultValue={detail.aboutHtml} />
        </label>
        <button className="btn" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
        {msg && (
          <p role="status" style={{ color: "var(--bms-muted)" }}>
            {msg}
          </p>
        )}
      </form>

      <form
        className="card"
        style={{ display: "grid", gap: 8, maxWidth: 420 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setBannerMsg(null);
          const fd = new FormData(e.currentTarget);
          const res = await fetch(`/admin/programmes/${detail.id}/banner`, {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          setBusy(false);
          if (res.ok) {
            setBannerKey(data.objectKey);
            setBannerMsg("Banner uploaded.");
          } else {
            setBannerMsg(`Rejected: ${data.error}`);
          }
        }}
      >
        <h3 style={{ margin: 0 }}>Programme banner (16:9, WebP/JPEG/PNG, ≤ 2 MB)</h3>
        {bannerKey && (
          // Served via the controlled /media route (published programme banners are public).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/media/${bannerKey}`}
            alt={`${detail.title} banner preview`}
            style={{
              width: "100%",
              maxWidth: 320,
              aspectRatio: "16 / 9",
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        )}
        <input type="file" name="file" accept="image/webp,image/jpeg,image/png" required />
        <button className="btn" disabled={busy} aria-busy={busy}>
          {busy ? "Uploading…" : "Upload banner"}
        </button>
        {bannerMsg && <p style={{ color: "var(--bms-muted)" }}>{bannerMsg}</p>}
      </form>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updateCredentialMetaAction } from "@/app/admin/actions";

/**
 * Edit a credential's identity + display metadata — including the Code, which is
 * useful after an OLX import (the importer suffixes the code with a checksum).
 * Organisation lives here now (per credential), not on the project.
 */
export function CredentialMeta({
  credentialId,
  initial,
}: {
  credentialId: string;
  initial: { code: string; slug: string; title: string; organisation: string; topic: string };
}) {
  const [code, setCode] = useState(initial.code);
  const [slug, setSlug] = useState(initial.slug);
  const [title, setTitle] = useState(initial.title);
  const [organisation, setOrganisation] = useState(initial.organisation);
  const [topic, setTopic] = useState(initial.topic);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const label: React.CSSProperties = { display: "grid", gap: 4, fontSize: 13, fontWeight: 600 };

  return (
    <form
      className="card"
      style={{ display: "grid", gap: 12, maxWidth: 520 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMsg(null);
          const res = await updateCredentialMetaAction(credentialId, {
            code,
            slug,
            title,
            organisation,
            topic,
          });
          setMsg(res.message);
        });
      }}
    >
      <h3 style={{ margin: 0 }}>Credential details</h3>
      <label style={label}>
        Code
        <input value={code} onChange={(e) => setCode(e.target.value)} required />
      </label>
      <label style={label}>
        Slug
        <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </label>
      <label style={label}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label style={label}>
        Organisation
        <input
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
          placeholder="Delivering university / partner"
          required
        />
      </label>
      <label style={label}>
        Topic
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Renewable Energy"
        />
      </label>
      <button className="btn" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
      {msg && (
        <p role="status" style={{ color: "var(--bms-muted)", margin: 0 }}>
          {msg}
        </p>
      )}
    </form>
  );
}

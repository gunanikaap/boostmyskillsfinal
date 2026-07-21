"use client";

import { useState, useTransition } from "react";
import {
  setProgrammeCredentialsAction,
  publishProgrammeAction,
  toggleProgrammeHiddenAction,
} from "@/app/admin/actions";
import type { AdminProgrammeDetail } from "@/lib/admin/queries";

interface Member {
  credentialId: string;
  code: string;
  title: string | null;
  isRequired: boolean;
  publishable: boolean;
}

const ghost: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 13,
  background: "transparent",
  color: "var(--bms-green-dark)",
  border: "1px solid var(--bms-border)",
};

export function MembershipEditor({ detail }: { detail: AdminProgrammeDetail }) {
  const [members, setMembers] = useState<Member[]>(
    detail.members.map((m) => ({
      credentialId: m.credentialId,
      code: m.code,
      title: m.title,
      isRequired: m.isRequired,
      publishable: m.publishable,
    })),
  );
  const [available, setAvailable] = useState(detail.available);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= members.length) return;
    setMembers((m) => {
      const c = m.slice();
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });
  };
  const add = (id: string) => {
    const cred = available.find((a) => a.id === id);
    if (!cred) return;
    setMembers((m) => [
      ...m,
      {
        credentialId: cred.id,
        code: cred.code,
        title: cred.title,
        isRequired: true,
        publishable: cred.publishable,
      },
    ]);
    setAvailable((a) => a.filter((x) => x.id !== id));
  };
  const remove = (id: string) => {
    const m = members.find((x) => x.credentialId === id);
    if (!m) return;
    setMembers((ms) => ms.filter((x) => x.credentialId !== id));
    setAvailable((a) => [
      ...a,
      { id: m.credentialId, code: m.code, title: m.title, publishable: m.publishable },
    ]);
  };

  const save = () =>
    start(async () => {
      const items = members.map((m, i) => ({
        credentialId: m.credentialId,
        position: i,
        isRequired: m.isRequired,
      }));
      setMsg((await setProgrammeCredentialsAction(detail.id, items)).message);
    });

  const canPublish = members.length >= 2 && members.every((m) => m.publishable);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {msg && (
        <div className="card" role="status" style={{ background: "#f3faf6" }}>
          {msg}
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Member credentials (ordered)</h3>
        {detail.status !== "draft" && (
          <p style={{ color: "var(--bms-muted)", margin: 0, fontSize: 13 }}>
            Membership is locked once real registrations exist; saving may be rejected.
          </p>
        )}
        {members.length === 0 && (
          <p style={{ color: "var(--bms-muted)" }}>
            No credentials yet. Add at least two from the same project.
          </p>
        )}
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {members.map((m, i) => (
            <li
              key={m.credentialId}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}
            >
              <span style={{ flex: 1 }}>
                <strong>{m.code}</strong> — {m.title ?? "—"}{" "}
                {!m.publishable && (
                  <span style={{ color: "#a15", fontSize: 12 }}>(not publishable)</span>
                )}
              </span>
              <label style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={m.isRequired}
                  onChange={(e) =>
                    setMembers((ms) =>
                      ms.map((x, k) => (k === i ? { ...x, isRequired: e.target.checked } : x)),
                    )
                  }
                />{" "}
                required
              </label>
              <button
                style={ghost}
                className="btn"
                onClick={() => move(i, -1)}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                style={ghost}
                className="btn"
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                ↓
              </button>
              <button style={ghost} className="btn" onClick={() => remove(m.credentialId)}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            aria-label="Add credential"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                add(e.target.value);
                e.target.value = "";
              }
            }}
          >
            <option value="">+ Add credential from this project…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.title ?? "—"}
              </option>
            ))}
          </select>
          <button className="btn" disabled={pending} aria-busy={pending} onClick={save}>
            {pending ? "Saving…" : "Save membership"}
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <strong>Status: {detail.status}</strong>
        {detail.status !== "published" && (
          <button
            className="btn"
            disabled={pending || !canPublish}
            title={canPublish ? "" : "Need ≥2 publishable member credentials"}
            onClick={() =>
              start(async () => setMsg((await publishProgrammeAction(detail.id)).message))
            }
          >
            Publish programme
          </button>
        )}
        {detail.status === "hidden" ? (
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () =>
                setMsg((await toggleProgrammeHiddenAction(detail.id, false)).message),
              )
            }
          >
            Unhide
          </button>
        ) : (
          detail.status !== "draft" && (
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () =>
                  setMsg((await toggleProgrammeHiddenAction(detail.id, true)).message),
                )
              }
            >
              Hide
            </button>
          )
        )}
        {!canPublish && detail.status !== "published" && (
          <span style={{ color: "var(--bms-muted)", fontSize: 13 }}>
            Publish needs ≥ 2 member credentials, all published.
          </span>
        )}
      </div>
    </div>
  );
}

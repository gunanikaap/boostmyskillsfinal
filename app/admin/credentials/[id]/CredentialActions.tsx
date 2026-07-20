"use client";

import { useState, useTransition } from "react";
import {
  publishCredentialAction,
  createDraftChangesAction,
  hideCredentialAction,
  unhideCredentialAction,
} from "@/app/admin/actions";

/**
 * Publish / hide / unhide / create-draft-changes controls. Content authoring
 * lives in the visual ContentBuilder; publishing runs the transactional,
 * validated service (immutable published revisions).
 */
export function CredentialActions({
  credentialId,
  status,
  hasDraft,
  hasPublished,
}: {
  credentialId: string;
  status: string;
  hasDraft: boolean;
  hasPublished: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ message: string }>) =>
    start(async () => setMsg((await fn()).message));

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>Publication</h3>
      {msg && (
        <div role="status" style={{ background: "#f3faf6", padding: 8, borderRadius: 8 }}>
          {msg}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {hasDraft && (
          <button
            className="btn"
            disabled={pending}
            aria-busy={pending}
            onClick={() => run(() => publishCredentialAction(credentialId))}
          >
            {pending ? "Working…" : "Publish changes"}
          </button>
        )}
        {!hasDraft && hasPublished && (
          <button
            className="btn"
            disabled={pending}
            onClick={() => run(() => createDraftChangesAction(credentialId))}
          >
            Create draft changes from published content
          </button>
        )}
        {status === "hidden" ? (
          <button
            className="btn"
            disabled={pending}
            onClick={() => run(() => unhideCredentialAction(credentialId))}
          >
            Unhide
          </button>
        ) : (
          status !== "draft" && (
            <button
              className="btn"
              disabled={pending}
              onClick={() => run(() => hideCredentialAction(credentialId))}
            >
              Hide
            </button>
          )
        )}
      </div>
      <p style={{ color: "var(--bms-muted)", margin: 0, fontSize: 13 }}>
        Publishing validates the draft (unique stable IDs, grading references, no answers in learner
        content) in one transaction and makes the published revision immutable.
      </p>
    </div>
  );
}

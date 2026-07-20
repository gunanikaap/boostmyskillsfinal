"use client";

import { useState, useTransition } from "react";
import {
  saveDraftContentAction,
  publishCredentialAction,
  createDraftChangesAction,
  hideCredentialAction,
  unhideCredentialAction,
} from "@/app/admin/actions";

export function CredentialActions({
  credentialId,
  status,
  hasDraft,
  hasPublished,
  draftContent,
  draftGrading,
  draftRule,
}: {
  credentialId: string;
  status: string;
  hasDraft: boolean;
  hasPublished: boolean;
  draftContent: string;
  draftGrading: string;
  draftRule: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [content, setContent] = useState(draftContent);
  const [grading, setGrading] = useState(draftGrading);
  const [rule, setRule] = useState(draftRule);

  const run = (fn: () => Promise<{ message: string }>) =>
    start(async () => setMsg((await fn()).message));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {msg && (
        <div className="card" role="status" style={{ background: "#f3faf6" }}>
          {msg}
        </div>
      )}

      {hasDraft && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Draft content (JSON authoring)</h3>
          <p style={{ color: "var(--bms-muted)", margin: 0, fontSize: 13 }}>
            Content is validated on publish: stable IDs must be unique, grading may only reference
            existing question/option IDs, and correct answers may never appear in the content
            document.
          </p>
          <label>content_document</label>
          <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
          <label>grading_document</label>
          <textarea rows={6} value={grading} onChange={(e) => setGrading(e.target.value)} />
          <label>certification_rule</label>
          <textarea rows={3} value={rule} onChange={(e) => setRule(e.target.value)} />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  try {
                    return await saveDraftContentAction(credentialId, {
                      content: JSON.parse(content),
                      grading: JSON.parse(grading),
                      certificationRule: JSON.parse(rule),
                    });
                  } catch {
                    return { message: "Invalid JSON — please fix and retry." };
                  }
                })
              }
            >
              Save draft
            </button>
            <button
              className="btn"
              disabled={pending}
              onClick={() => run(() => publishCredentialAction(credentialId))}
            >
              Publish changes
            </button>
          </div>
        </div>
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

      <div style={{ display: "flex", gap: 10 }}>
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
    </div>
  );
}

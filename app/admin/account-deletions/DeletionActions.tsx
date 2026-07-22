"use client";

import { useState, useTransition } from "react";
import { approveAccountDeletionAction, rejectAccountDeletionAction } from "@/app/admin/actions";

/**
 * Approve / reject controls for one pending account-deletion request. Approving
 * closes the account (deactivates it + best-effort Clerk removal); rejecting
 * leaves it fully active. Both take an optional note recorded on the request.
 */
export function DeletionActions({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function run(kind: "approve" | "reject") {
    start(async () => {
      const res =
        kind === "approve"
          ? await approveAccountDeletionAction(requestId, note)
          : await rejectAccountDeletionAction(requestId, note);
      setMsg(res.message);
      if (res.ok) setMode(null);
    });
  }

  if (mode) {
    return (
      <div style={{ display: "grid", gap: 8, minWidth: 240 }}>
        <textarea
          className="account-input"
          rows={2}
          value={note}
          placeholder="Note (optional)"
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={mode === "approve" ? "btn btn-danger btn-sm" : "btn btn-sm"}
            disabled={pending}
            onClick={() => run(mode)}
          >
            {pending ? "Working…" : mode === "approve" ? "Confirm approval" : "Confirm rejection"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={pending}
            onClick={() => setMode(null)}
          >
            Cancel
          </button>
        </div>
        {msg && <span style={{ color: "var(--bms-muted)", fontSize: 13 }}>{msg}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-danger btn-sm" onClick={() => setMode("approve")}>
        Approve
      </button>
      <button className="btn btn-outline btn-sm" onClick={() => setMode("reject")}>
        Reject
      </button>
      {msg && <span style={{ color: "var(--bms-muted)", fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

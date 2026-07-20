"use client";

import { useState, useTransition } from "react";
import { setMaintenanceAction } from "@/app/admin/actions";

export function MaintenanceToggle({
  initialEnabled,
  initialMessage,
}: {
  initialEnabled: boolean;
  initialMessage: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <div style={{ fontSize: 18 }}>
        Maintenance mode is currently: <strong>{enabled ? "ON" : "OFF"}</strong>
      </div>
      <label>Maintenance message shown to learners</label>
      <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const next = !enabled;
              const res = await setMaintenanceAction(next, message);
              if (res.ok) setEnabled(next);
              setStatus(res.message);
            })
          }
        >
          {enabled ? "Disable maintenance" : "Enable maintenance"}
        </button>
      </div>
      {status && <p style={{ color: "var(--bms-muted)" }}>{status}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { registerForProgrammeAction } from "./actions";

export function RegisterButton({ programmeId }: { programmeId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await registerForProgrammeAction(programmeId);
            setMessage(res.message);
          })
        }
      >
        {pending ? "Registering…" : "Register for programme"}
      </button>
      {message && (
        <p style={{ marginTop: 10, color: "var(--bms-muted)" }} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

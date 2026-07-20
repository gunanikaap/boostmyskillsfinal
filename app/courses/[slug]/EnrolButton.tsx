"use client";

import { useState, useTransition } from "react";
import { enrolInCredentialAction } from "./actions";

export function EnrolButton({ credentialId }: { credentialId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await enrolInCredentialAction(credentialId);
            setMessage(res.message);
          })
        }
      >
        {pending ? "Enrolling…" : "Enrol"}
      </button>
      {message && (
        <p style={{ marginTop: 10, color: "var(--bms-muted)" }} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

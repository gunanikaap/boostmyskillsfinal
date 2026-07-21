"use client";

import { useState, useTransition } from "react";
import { enrolInCredentialAction } from "./actions";

export function EnrolButton({ credentialId }: { credentialId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn btn-lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await enrolInCredentialAction(credentialId);
            setMessage(res.message);
          })
        }
      >
        {pending ? (
          "Enrolling…"
        ) : (
          <>
            Enrol
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      {message && (
        <p style={{ marginTop: 10, color: "var(--bms-muted)" }} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerForProgrammeAction } from "./actions";

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RegisterButton({
  programmeId,
  signedIn,
  signInHref,
}: {
  programmeId: string;
  signedIn: boolean;
  signInHref: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Anonymous visitors are sent to sign in (and returned here afterwards).
  if (!signedIn) {
    return (
      <Link href={signInHref} className="btn btn-lg">
        Register for programme <Arrow />
      </Link>
    );
  }

  return (
    <div>
      <button
        className="btn btn-lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await registerForProgrammeAction(programmeId);
            setMessage(res.message);
          })
        }
      >
        {pending ? (
          "Registering…"
        ) : (
          <>
            Register for programme <Arrow />
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

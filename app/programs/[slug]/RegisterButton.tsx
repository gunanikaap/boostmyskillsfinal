"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerForProgrammeAction, unregisterFromProgrammeAction } from "./actions";

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

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RegisterButton({
  programmeId,
  signedIn,
  registered,
  signInHref,
}: {
  programmeId: string;
  signedIn: boolean;
  registered: boolean;
  signInHref: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  // Anonymous visitors are sent to sign in (and returned here afterwards).
  if (!signedIn) {
    return (
      <Link href={signInHref} className="btn btn-lg">
        Register for programme <Arrow />
      </Link>
    );
  }

  if (registered) {
    return (
      <div className="enrol-state">
        <span className="btn btn-lg enrol-state__badge" aria-disabled="true">
          <Check /> Registered
        </span>
        <button
          type="button"
          className="enrol-state__undo"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await unregisterFromProgrammeAction(programmeId);
              setMessage(res.ok ? null : res.message);
              if (res.ok) router.refresh();
            })
          }
        >
          {pending ? "Unregistering…" : "Unregister"}
        </button>
        {message && (
          <p style={{ marginTop: 8, color: "var(--bms-muted)" }} role="status">
            {message}
          </p>
        )}
      </div>
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
            setMessage(res.ok ? null : res.message);
            if (res.ok) router.refresh();
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

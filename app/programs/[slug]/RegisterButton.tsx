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
  const [confirming, setConfirming] = useState(false);
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
    if (confirming) {
      return (
        <div className="enrol-confirm">
          <span className="enrol-confirm__q">Unregister from this programme?</span>
          <div className="enrol-confirm__actions">
            <button
              type="button"
              className="btn btn-lg enrol-confirm__yes"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await unregisterFromProgrammeAction(programmeId);
                  if (res.ok) {
                    setConfirming(false);
                    router.refresh();
                  } else {
                    setMessage(res.message);
                  }
                })
              }
            >
              {pending ? "Unregistering…" : "Yes, unregister"}
            </button>
            <button
              type="button"
              className="enrol-state__undo"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
          {message && (
            <p style={{ margin: "8px 0 0", color: "var(--bms-muted)" }} role="status">
              {message}
            </p>
          )}
        </div>
      );
    }
    return (
      <button
        type="button"
        className="btn btn-lg enrol-state__toggle"
        title="Click to unregister"
        onClick={() => setConfirming(true)}
      >
        <Check /> Registered
      </button>
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

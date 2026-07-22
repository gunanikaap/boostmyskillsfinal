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

  const view = !signedIn
    ? "signin"
    : !registered
      ? "register"
      : confirming
        ? "confirm"
        : "registered";

  // key={view} replays the .enrol-anim transition on every state change.
  return (
    <div key={view} className="enrol-anim">
      {view === "signin" && (
        <Link href={signInHref} className="btn btn-lg">
          Register for programme <Arrow />
        </Link>
      )}

      {view === "register" && (
        <>
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
        </>
      )}

      {view === "registered" && (
        <button
          type="button"
          className="btn btn-lg enrol-state__toggle"
          title="Click to unregister"
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
        >
          <Check /> Registered
        </button>
      )}

      {view === "confirm" && (
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
      )}
    </div>
  );
}

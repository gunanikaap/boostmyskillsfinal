"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enrolInCredentialAction, unenrolFromCredentialAction } from "./actions";

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

export function EnrolButton({
  credentialId,
  signedIn,
  enrolled,
  completed,
  signInHref,
}: {
  credentialId: string;
  signedIn: boolean;
  enrolled: boolean;
  completed: boolean;
  signInHref: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const view = !signedIn
    ? "signin"
    : !enrolled
      ? "enrol"
      : completed
        ? "completed"
        : confirming
          ? "confirm"
          : "enrolled";

  // key={view} replays the .enrol-anim transition on every state change.
  return (
    <div key={view} className="enrol-anim">
      {view === "signin" && (
        <Link href={signInHref} className="btn btn-lg">
          Enrol <Arrow />
        </Link>
      )}

      {view === "enrol" && (
        <>
          <button
            className="btn btn-lg"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await enrolInCredentialAction(credentialId);
                setMessage(res.ok ? null : res.message);
                if (res.ok) router.refresh();
              })
            }
          >
            {pending ? (
              "Enrolling…"
            ) : (
              <>
                Enrol <Arrow />
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

      {view === "enrolled" && (
        <div className="enrol-state">
          <button
            type="button"
            className="btn btn-lg enrol-state__toggle"
            title="Click to unenrol"
            onClick={() => {
              setMessage(null);
              setConfirming(true);
            }}
          >
            <Check /> Enrolled
          </button>
          <Link href={`/learn/${credentialId}`} className="enrol-state__go">
            Go to course <Arrow />
          </Link>
        </div>
      )}

      {view === "completed" && (
        <div className="enrol-state">
          <span className="btn btn-lg enrol-state__done" aria-disabled="true">
            <Check /> Completed
          </span>
          <Link href={`/learn/${credentialId}`} className="enrol-state__go">
            Go to course <Arrow />
          </Link>
        </div>
      )}

      {view === "confirm" && (
        <div className="enrol-confirm">
          <span className="enrol-confirm__q">Unenrol from this micro-credential?</span>
          <div className="enrol-confirm__actions">
            <button
              type="button"
              className="btn btn-lg enrol-confirm__yes"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await unenrolFromCredentialAction(credentialId);
                  if (res.ok) {
                    setConfirming(false);
                    router.refresh();
                  } else {
                    setMessage(res.message);
                  }
                })
              }
            >
              {pending ? "Unenrolling…" : "Yes, unenrol"}
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

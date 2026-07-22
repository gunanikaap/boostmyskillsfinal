"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enrolInCredentialAction } from "./actions";

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
  signInHref,
}: {
  credentialId: string;
  signedIn: boolean;
  enrolled: boolean;
  signInHref: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  // Anonymous visitors are sent to sign in (and returned here afterwards).
  if (!signedIn) {
    return (
      <Link href={signInHref} className="btn btn-lg">
        Enrol <Arrow />
      </Link>
    );
  }

  // Already enrolled (directly or via a programme): show state + continue link.
  if (enrolled) {
    return (
      <div className="enrol-state">
        <span className="btn btn-lg enrol-state__badge" aria-disabled="true">
          <Check /> Enrolled
        </span>
        <Link href={`/learn/${credentialId}`} className="enrol-state__go">
          Go to course <Arrow />
        </Link>
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
    </div>
  );
}

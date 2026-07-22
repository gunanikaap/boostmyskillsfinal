"use client";

import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";

/**
 * Signed-in user dropdown for the site header — mirrors the live site: an avatar
 * + username summary that opens to Dashboard / Account / Sign Out.
 */
export default function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const name = user?.username ?? user?.firstName ?? "Account";

  return (
    <details className="usermenu">
      <summary aria-label="Account menu">
        <span className="usermenu__avatar" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="usermenu__name">{name}</span>
        <svg
          className="chev"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="usermenu__panel">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/account">Account</Link>
        <button type="button" onClick={() => signOut({ redirectUrl: "/" })}>
          Sign Out
        </button>
      </div>
    </details>
  );
}

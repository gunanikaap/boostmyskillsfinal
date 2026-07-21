"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Mobile navigation: a hamburger that toggles a panel with the catalogue links
 * and auth actions. Accessible — Escape closes it, clicking outside closes it,
 * and the toggle exposes aria-expanded. Shown only under the mobile breakpoint
 * (the desktop nav is hidden there via CSS).
 */
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="mobile-nav" ref={ref}>
      <button
        type="button"
        className="mobile-nav__toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      {open && (
        <div className="mobile-nav__panel" role="menu">
          <span className="mobile-nav__label">Catalogue</span>
          <Link href="/programs" role="menuitem" onClick={() => setOpen(false)}>
            Micro-programmes
          </Link>
          <Link href="/courses" role="menuitem" onClick={() => setOpen(false)}>
            Micro-credentials
          </Link>
          <Link href="/about" role="menuitem" onClick={() => setOpen(false)}>
            About
          </Link>
          <hr />
          <Link
            href="/sign-up"
            className="btn btn-outline"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Register for free
          </Link>
          <Link href="/sign-in" className="btn" role="menuitem" onClick={() => setOpen(false)}>
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}

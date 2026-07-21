"use client";

/** Post-auth redirect target: the ?redirect_url= param, but only if same-origin. */
export function safeNext(): string {
  if (typeof window === "undefined") return "/dashboard";
  const raw = new URLSearchParams(window.location.search).get("redirect_url");
  if (!raw) return "/dashboard";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin === window.location.origin) return u.pathname + u.search;
  } catch {
    /* fall through to the safe default */
  }
  return "/dashboard";
}

/** Extract a human-readable message from a Clerk API error. */
export function clerkErrorMessage(err: unknown): string {
  const e = err as { errors?: { longMessage?: string; message?: string }[] } | undefined;
  const first = e?.errors?.[0];
  return (
    first?.longMessage ??
    first?.message ??
    "Something went wrong. Please check your details and try again."
  );
}

/** Show/hide password toggle button used inside .auth-input-wrap. */
export function EyeButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="auth-eye"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
    >
      {shown ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4 10 7a12 12 0 01-2.2 3M6.3 6.3A12 12 0 002 12c1 3 5 7 10 7a9.5 9.5 0 004-.9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )}
    </button>
  );
}

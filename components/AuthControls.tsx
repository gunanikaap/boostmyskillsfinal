import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

/**
 * Sign-in / sign-up / signed-in user controls for the site header.
 *
 * Guarded on clerkConfigured(): when Clerk keys are present, render the real
 * Clerk components (which require ClerkProvider, mounted by the root layout).
 * Without keys (e.g. a keyless CI build), fall back to a plain link so the
 * production build still succeeds and the app remains usable.
 */
export default function AuthControls() {
  if (!clerkConfigured()) {
    return (
      <Link href="/sign-in" className="btn" style={{ padding: "6px 14px" }}>
        Sign in
      </Link>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            className="btn"
            style={{
              padding: "6px 14px",
              background: "transparent",
              color: "var(--bms-green-dark)",
              border: "1px solid var(--bms-border)",
            }}
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="btn" style={{ padding: "6px 14px" }}>
            Sign up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}

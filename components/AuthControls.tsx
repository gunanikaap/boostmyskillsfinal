import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

/**
 * Sign-in / register / signed-in user controls for the site header, matching the
 * boostmyskills.eu layout: "Register for free" (outline) + "Sign in" (filled).
 *
 * Guarded on clerkConfigured(): when Clerk keys are present, render the real
 * Clerk components (which require ClerkProvider, mounted by the root layout).
 * Without keys (e.g. a keyless CI build), fall back to plain links so the
 * production build still succeeds and the app remains usable.
 */
export default function AuthControls() {
  if (!clerkConfigured()) {
    return (
      <>
        <Link href="/sign-up" className="btn btn-outline">
          Register for free
        </Link>
        <Link href="/sign-in" className="btn">
          Sign in
        </Link>
      </>
    );
  }
  return (
    <>
      <SignedOut>
        <SignUpButton mode="modal">
          <button className="btn btn-outline" type="button">
            Register for free
          </button>
        </SignUpButton>
        <SignInButton mode="modal">
          <button className="btn" type="button">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link href="/dashboard" className="btn btn-outline">
          Dashboard
        </Link>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}

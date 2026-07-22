import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import UserMenu from "@/components/UserMenu";

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
        <Link href="/sign-up" className="btn btn-outline btn-lg">
          Register for free
        </Link>
        <Link href="/sign-in" className="btn btn-lg">
          Sign in
        </Link>
      </>
    );
  }
  return (
    <>
      <SignedOut>
        <Link href="/sign-up" className="btn btn-outline btn-lg">
          Register for free
        </Link>
        <Link href="/sign-in" className="btn btn-lg">
          Sign in
        </Link>
      </SignedOut>
      <SignedIn>
        <UserMenu />
      </SignedIn>
    </>
  );
}

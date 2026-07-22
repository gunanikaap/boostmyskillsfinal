import { resolveExternalIdentity } from "@/lib/auth/identity";

/**
 * Cheap boolean: is the current request from a signed-in user? Safe on keyless
 * builds (no Clerk middleware) — resolves to false rather than throwing.
 */
export async function isSignedIn(): Promise<boolean> {
  try {
    return (await resolveExternalIdentity()) !== null;
  } catch {
    return false;
  }
}

/** A /sign-in URL that returns to `next` (a same-origin path) after auth. */
export function signInHref(next: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(next)}`;
}

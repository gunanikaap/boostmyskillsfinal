/**
 * Whether a Clerk publishable key is configured. When it is not (e.g. the local
 * baseline build without secrets, or CI), the app renders without ClerkProvider
 * and auth-gated pages surface a configuration notice rather than crashing.
 * This keeps the production build honest and green even while real Clerk
 * integration is an external blocker (no UAT keys yet).
 */
export function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

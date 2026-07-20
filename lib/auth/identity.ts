import { testAuthEnabled, isTestEnv } from "@/lib/env";

/** A resolved external identity (from Clerk in real deployments). */
export interface ExternalIdentity {
  clerkUserId: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Test-only identity override. This is set exclusively by the test harness and
 * is only consulted when APP_ENV === "test" AND TEST_AUTH_ENABLED === true.
 * It can never be reached in a uat/production build because testAuthEnabled()
 * hard-gates on APP_ENV === "test".
 */
let testActor: ExternalIdentity | null = null;

export function setTestActor(identity: ExternalIdentity | null): void {
  if (!isTestEnv()) {
    throw new Error("setTestActor() may only be called under APP_ENV=test");
  }
  testActor = identity;
}

/**
 * Resolve the current request's external identity.
 * - test env with the adapter enabled → the injected test actor
 * - otherwise → Clerk's server-side auth() (imported lazily so builds without
 *   Clerk keys do not fail)
 */
export async function resolveExternalIdentity(): Promise<ExternalIdentity | null> {
  if (testAuthEnabled()) {
    return testActor;
  }
  // Lazy import keeps @clerk/nextjs out of any code path that must run without keys.
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? "";
  return {
    clerkUserId: userId,
    email,
    username: user?.username ?? null,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
  };
}

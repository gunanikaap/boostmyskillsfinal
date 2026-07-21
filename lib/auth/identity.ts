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
 * Pure parser for the cross-process test-auth headers used by the authenticated
 * Playwright vertical. Kept pure (no `next/headers`, no env read) so its security
 * behaviour is exhaustively unit-testable.
 *
 * Returns an identity ONLY when the caller presents the exact server-side secret
 * AND a well-formed actor payload. Any missing/mismatched secret, missing env
 * secret, absent payload, malformed JSON, missing/empty required field, or an
 * unsupported caller-supplied `role` → null.
 *
 * SECURITY: this parser resolves only the EXTERNAL identity (clerk id + profile),
 * never an application role. Authorization role is derived exclusively from the
 * `app_users` row by `syncAppUser`; a `role` in the header is NEVER trusted to
 * grant privilege — an unknown role value is rejected, and a known value is
 * ignored. To act as an admin, the harness must have provisioned that
 * `app_users` row as admin out-of-band; a caller cannot self-elevate.
 *
 * This function is only ever consulted from behind the APP_ENV==="test" gate in
 * resolveExternalIdentity(); it can never run in a uat/production request.
 */
export function parseTestActorHeader(
  secretHeader: string | null,
  actorHeader: string | null,
  expectedSecret: string | undefined,
): ExternalIdentity | null {
  if (!expectedSecret) return null; // no server secret configured → adapter inert
  if (secretHeader !== expectedSecret) return null; // wrong/absent secret
  if (!actorHeader) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(actorHeader) as Record<string, unknown>;
  } catch {
    return null;
  }
  // Required identity fields must be present, string, and non-empty.
  if (typeof p.clerkUserId !== "string" || p.clerkUserId.trim() === "") return null;
  if (typeof p.email !== "string" || !p.email.includes("@")) return null;
  // A caller-supplied role is never used for authorization; reject an unsupported
  // value outright rather than silently dropping it (defence in depth).
  if (p.role !== undefined && p.role !== "learner" && p.role !== "admin") return null;
  return {
    clerkUserId: p.clerkUserId,
    email: p.email,
    username: typeof p.username === "string" ? p.username : null,
    firstName: typeof p.firstName === "string" ? p.firstName : null,
    lastName: typeof p.lastName === "string" ? p.lastName : null,
  };
}

/**
 * Cross-process test identity from request headers. Used only by the authenticated
 * Playwright vertical, where the browser (a separate process) cannot call
 * setTestActor(). Reads `next/headers`; if there is no request scope (e.g. the
 * in-process Vitest suite with no injected actor) it safely resolves to null.
 */
async function resolveTestHeaderIdentity(): Promise<ExternalIdentity | null> {
  const expectedSecret = process.env.TEST_AUTH_SECRET;
  if (!expectedSecret) return null;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return parseTestActorHeader(h.get("x-test-auth-secret"), h.get("x-test-actor"), expectedSecret);
  } catch {
    return null; // outside a request scope
  }
}

/**
 * Resolve the current request's external identity.
 * - test env with the adapter enabled → the in-process injected actor, or, if
 *   none, a secret-gated request-header actor (authenticated Playwright vertical)
 * - otherwise → Clerk's server-side auth() (imported lazily so builds without
 *   Clerk keys do not fail)
 */
export async function resolveExternalIdentity(): Promise<ExternalIdentity | null> {
  if (testAuthEnabled()) {
    if (testActor) return testActor;
    return resolveTestHeaderIdentity();
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

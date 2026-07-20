import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Clerk edge middleware. Protects authenticated areas at the edge as a first
 * line of defence — the authoritative authorization still happens server-side in
 * each route/action via requireAdmin()/requireAuthenticatedUser() (pg is
 * Node-only and cannot run here).
 *
 * When Clerk is not configured (no publishable key), the middleware is a
 * pass-through so the app still builds and runs for non-auth flows.
 */
const isProtected = createRouteMatcher(["/dashboard(.*)", "/account(.*)", "/admin(.*)"]);

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const handler = clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) {
        await auth.protect();
      }
    })
  : (_req: NextRequest) => NextResponse.next();

export default handler;

export const config = {
  matcher: [
    // Skip Next internals and static files; run on everything else + API routes.
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};

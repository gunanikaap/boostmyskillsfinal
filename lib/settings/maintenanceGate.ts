import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getMaintenance } from "@/lib/settings/maintenance";

/** Paths that stay reachable while maintenance mode is on (for everyone). */
const ALLOWED_DURING_MAINTENANCE = new Set(["/", "/maintenance"]);

/**
 * Global maintenance gate — runs in the root layout, so it covers EVERY page
 * (including sign-in / sign-up and the legal pages, which don't opt in
 * individually). When maintenance is on, only the home page and /maintenance
 * itself are reachable; everyone else is redirected to /maintenance. Admins keep
 * full access so they can turn it back off.
 *
 * pg is Node-only and can't run in edge middleware, so enforcement lives here in
 * the server render path; the middleware supplies the request path via the
 * `x-pathname` header.
 */
export async function enforceMaintenanceGate(): Promise<void> {
  const { maintenanceMode } = await getMaintenance();
  if (!maintenanceMode) return;

  const pathname = (await headers()).get("x-pathname") ?? "/";
  if (ALLOWED_DURING_MAINTENANCE.has(pathname)) return;

  const user = await getCurrentAppUser();
  if (user?.role === "admin") return; // admins retain full access
  redirect("/maintenance");
}

/**
 * Per-page maintenance enforcement (retained for defence-in-depth on the pages
 * that already call it). The global {@link enforceMaintenanceGate} is the
 * authoritative gate; this simply re-checks. Admins bypass.
 */
export async function enforceMaintenanceForPage(): Promise<void> {
  const { maintenanceMode } = await getMaintenance();
  if (!maintenanceMode) return;
  const user = await getCurrentAppUser();
  if (user?.role === "admin") return;
  redirect("/maintenance");
}

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getMaintenance } from "@/lib/settings/maintenance";

/**
 * Paths that stay reachable while maintenance mode is on (for everyone):
 *  - the home page and the /maintenance page itself;
 *  - /sign-in, so an administrator can still log in and reach /admin to turn
 *    maintenance back off. (Sign-up and every other page stay blocked.)
 */
function allowedDuringMaintenance(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/maintenance" ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/")
  );
}

/**
 * Global maintenance gate — runs in the root template, so it covers EVERY page
 * on every navigation (including sign-up and the legal pages, which don't opt in
 * individually). When maintenance is on, only the home page, /maintenance and
 * the sign-in page are reachable; everyone else is redirected to /maintenance.
 * Admins keep full access so they can turn it back off.
 *
 * pg is Node-only and can't run in edge middleware, so enforcement lives here in
 * the server render path; the middleware supplies the request path via the
 * `x-pathname` header.
 */
export async function enforceMaintenanceGate(): Promise<void> {
  const { maintenanceMode } = await getMaintenance();
  if (!maintenanceMode) return;

  const pathname = (await headers()).get("x-pathname") ?? "/";
  if (allowedDuringMaintenance(pathname)) return;

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

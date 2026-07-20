import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getMaintenance } from "@/lib/settings/maintenance";

/**
 * Server-side maintenance enforcement for non-home public/learner pages.
 * Called at the top of each such page's server component (pg is Node-only and
 * cannot run in edge middleware, so enforcement lives in the server render path).
 * Admins bypass; everyone else is redirected to /maintenance when it is on.
 */
export async function enforceMaintenanceForPage(): Promise<void> {
  const { maintenanceMode } = await getMaintenance();
  if (!maintenanceMode) return;
  const user = await getCurrentAppUser();
  if (user?.role === "admin") return;
  redirect("/maintenance");
}

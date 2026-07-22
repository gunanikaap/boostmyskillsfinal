import { enforceMaintenanceGate } from "@/lib/settings/maintenanceGate";

/**
 * Root template. Unlike the root layout (which persists across routes and is NOT
 * re-executed on client-side navigation), a template re-renders on EVERY
 * navigation — including soft/client navigations. That makes it the right place
 * for the global maintenance gate: it runs before any page renders, on both hard
 * loads and in-app navigations, so no page except home / maintenance can slip
 * through while maintenance is on.
 */
export default async function RootTemplate({ children }: { children: React.ReactNode }) {
  await enforceMaintenanceGate();
  return <>{children}</>;
}

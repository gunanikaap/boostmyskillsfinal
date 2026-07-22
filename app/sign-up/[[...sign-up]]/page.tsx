import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthPanel from "@/components/auth/AuthPanel";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import { isSignedIn } from "@/lib/auth/session";
import { safeReturnPath } from "@/lib/redirects/redirects";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  await enforceMaintenanceForPage();
  // Already-authenticated visitors shouldn't see the auth form.
  if (await isSignedIn()) {
    const { redirect_url } = await searchParams;
    redirect(safeReturnPath(redirect_url, "/dashboard"));
  }
  return (
    <AuthShell>
      {clerkConfigured() ? (
        <AuthPanel initial="register" />
      ) : (
        <p style={{ color: "var(--bms-muted)" }}>
          Registration is not yet configured in this environment (Clerk keys pending).
        </p>
      )}
    </AuthShell>
  );
}

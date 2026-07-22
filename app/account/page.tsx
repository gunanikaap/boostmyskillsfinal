import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getAccountView } from "@/lib/account/profile";
import { getMyDeletionRequest } from "@/lib/account/deletion";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import AccountSettings from "./AccountSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account settings" };

export default async function AccountPage() {
  await enforceMaintenanceForPage();
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in?redirect_url=/account");

  // A deactivated account (deletion approved) keeps read access to this page only,
  // to see the closure notice.
  if (user.deactivated) {
    return (
      <>
        <SiteHeader />
        <main className="container account">
          <div className="page-head">
            <h1>Account settings</h1>
          </div>
          <div className="account-closed">
            <h2>This account has been closed</h2>
            <p>
              An administrator approved your account deletion request, so your BoostMySkills account
              is now closed. If you believe this was a mistake, please{" "}
              <Link href="/contact">contact us</Link>.
            </p>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const view = await getAccountView(user.id);
  if (!view) redirect("/sign-in?redirect_url=/account");
  const deletion = await getMyDeletionRequest(user.id);

  return (
    <>
      <SiteHeader />
      <AccountSettings view={view} deletion={deletion} clerkEnabled={clerkConfigured()} />
      <SiteFooter />
    </>
  );
}
